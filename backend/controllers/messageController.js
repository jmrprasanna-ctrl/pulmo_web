const Message = require("../models/Message");
const User = require("../models/User");
const db = require("../config/database");
const { Op } = require("sequelize");

const DIRECTORY_DB = db.normalizeDatabaseName(process.env.DB_NAME || "inventory") || "inventory";
const ensuredMessageSchemaDbs = new Set();

function normalizeDatabaseName(value) {
    return db.normalizeDatabaseName(value) || DIRECTORY_DB;
}

function getActiveDatabaseName(req) {
    return normalizeDatabaseName(req?.databaseName || req?.user?.database_name || req?.headers?.["x-database-name"]);
}

function getAuthScope(req) {
    return String(req?.user?.auth_scope || req?.user?.authScope || "").trim().toLowerCase();
}

function getRequesterUserId(req) {
    const userId = Number(req?.user?.id || req?.user?.userId || 0);
    return Number.isFinite(userId) && userId > 0 ? userId : 0;
}

function getRequesterUserDatabase(req) {
    return getAuthScope(req) === "directory" ? DIRECTORY_DB : getActiveDatabaseName(req);
}

function buildUserRef(userDatabase, userId) {
    const normalizedDb = normalizeDatabaseName(userDatabase);
    const normalizedUserId = Number(userId || 0);
    if (!normalizedDb || !Number.isFinite(normalizedUserId) || normalizedUserId <= 0) {
        return "";
    }
    return `${normalizedDb}:${normalizedUserId}`;
}

function parseUserRef(value, fallbackDatabase = DIRECTORY_DB) {
    const raw = String(value || "").trim();
    if (!raw) return null;

    const directorySelfMatch = /^directory-self:(\d+)$/i.exec(raw);
    if (directorySelfMatch) {
        return {
            user_id: Number(directorySelfMatch[1] || 0),
            user_database: DIRECTORY_DB,
            raw,
        };
    }

    const compositeMatch = /^([a-z0-9_]+):(\d+)$/i.exec(raw);
    if (compositeMatch) {
        const userDatabase = normalizeDatabaseName(compositeMatch[1]);
        const userId = Number(compositeMatch[2] || 0);
        if (!userDatabase || !Number.isFinite(userId) || userId <= 0) return null;
        return {
            user_id: userId,
            user_database: userDatabase,
            raw,
        };
    }

    const userId = Number(raw || 0);
    if (!Number.isFinite(userId) || userId <= 0) return null;
    return {
        user_id: userId,
        user_database: normalizeDatabaseName(fallbackDatabase),
        raw,
    };
}

function userDisplayName(userLike, fallbackId = 0) {
    const plain = userLike && typeof userLike.toJSON === "function" ? userLike.toJSON() : (userLike || {});
    return String(plain.username || plain.email || (fallbackId ? `User ${fallbackId}` : "System")).trim();
}

function messageFallbackName(userRef, userId, fallbackLabel, emptyLabel = "All Users") {
    const label = String(fallbackLabel || "").trim();
    if (label) return label;
    const parsed = parseUserRef(userRef);
    if (parsed) return `User ${parsed.user_id}`;
    if (Number(userId || 0) > 0) return `User ${Number(userId || 0)}`;
    return emptyLabel;
}

async function ensureMessageSchema(databaseName) {
    const normalizedDb = normalizeDatabaseName(databaseName);
    if (ensuredMessageSchemaDbs.has(normalizedDb)) return;

    await db.registerDatabase(normalizedDb).catch(() => {});
    await db.withDatabase(normalizedDb, async () => {
        await Message.sync();
        await db.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS from_user_ref VARCHAR(160)`);
        await db.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS to_user_ref VARCHAR(160)`);
        await db.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS from_user_database VARCHAR(120)`);
        await db.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS to_user_database VARCHAR(120)`);
        await db.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS from_name VARCHAR(255)`);
        await db.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS to_name VARCHAR(255)`);
        await db.query(`CREATE INDEX IF NOT EXISTS messages_to_user_ref_idx ON messages(to_user_ref)`);
        await db.query(`CREATE INDEX IF NOT EXISTS messages_from_user_ref_idx ON messages(from_user_ref)`);
    });

    ensuredMessageSchemaDbs.add(normalizedDb);
}

async function findUserByIdentityInDatabase(databaseName, userLike) {
    const normalizedDb = normalizeDatabaseName(databaseName);
    const plain = userLike && typeof userLike.toJSON === "function" ? userLike.toJSON() : (userLike || {});
    const email = String(plain.email || "").trim().toLowerCase();
    const username = String(plain.username || "").trim().toLowerCase();
    if (!normalizedDb || (!email && !username)) return null;

    await db.registerDatabase(normalizedDb).catch(() => {});
    return db.withDatabase(normalizedDb, async () => {
        const identityWhere = [];
        if (email) identityWhere.push({ email: { [Op.iLike]: email } });
        if (username) identityWhere.push({ username: { [Op.iLike]: username } });
        if (!identityWhere.length) return null;
        return User.findOne({
            where: { [Op.or]: identityWhere },
            attributes: ["id", "username", "email"],
            order: [["id", "ASC"]],
        });
    });
}

async function buildViewerContext(req) {
    const activeDatabaseName = getActiveDatabaseName(req);
    const sourceDatabaseName = getRequesterUserDatabase(req);
    const requesterUserId = getRequesterUserId(req);
    const refs = new Set();
    const activeDbUserIds = new Set();
    const directoryDbUserIds = new Set();
    const primaryRef = buildUserRef(sourceDatabaseName, requesterUserId);

    if (primaryRef) refs.add(primaryRef);

    await db.registerDatabase(sourceDatabaseName).catch(() => {});
    const sourceUser = await db.withDatabase(sourceDatabaseName, async () =>
        User.findByPk(requesterUserId, { attributes: ["id", "username", "email"] })
    ).catch(() => null);

    if (sourceUser) {
        const sourceDbMatch = await findUserByIdentityInDatabase(sourceDatabaseName, sourceUser).catch(() => null);
        if (sourceDbMatch?.id) refs.add(buildUserRef(sourceDatabaseName, sourceDbMatch.id));

        if (sourceDatabaseName !== DIRECTORY_DB) {
            const directoryMatch = await findUserByIdentityInDatabase(DIRECTORY_DB, sourceUser).catch(() => null);
            if (directoryMatch?.id) refs.add(buildUserRef(DIRECTORY_DB, directoryMatch.id));
        }

        if (activeDatabaseName !== sourceDatabaseName) {
            const activeMatch = await findUserByIdentityInDatabase(activeDatabaseName, sourceUser).catch(() => null);
            if (activeMatch?.id) refs.add(buildUserRef(activeDatabaseName, activeMatch.id));
        }
    }

    for (const ref of refs) {
        const parsed = parseUserRef(ref);
        if (!parsed) continue;
        if (parsed.user_database === activeDatabaseName) {
            activeDbUserIds.add(parsed.user_id);
        }
        if (parsed.user_database === DIRECTORY_DB) {
            directoryDbUserIds.add(parsed.user_id);
        }
    }

    return {
        activeDatabaseName,
        sourceDatabaseName,
        requesterUserId,
        refs: Array.from(refs).filter(Boolean),
        activeDbUserIds: Array.from(activeDbUserIds).filter((x) => Number.isFinite(x) && x > 0),
        directoryDbUserIds: Array.from(directoryDbUserIds).filter((x) => Number.isFinite(x) && x > 0),
    };
}

async function fetchCentralMessages(viewerRefs = [], directoryDbUserIds = []) {
    await ensureMessageSchema(DIRECTORY_DB);

    const orFilters = [
        { [Op.and]: [{ to_user_ref: null }, { to_user_id: null }] },
    ];
    if (Array.isArray(viewerRefs) && viewerRefs.length) {
        orFilters.unshift(
            { to_user_ref: { [Op.in]: viewerRefs } },
            { from_user_ref: { [Op.in]: viewerRefs } }
        );
    }
    if (Array.isArray(directoryDbUserIds) && directoryDbUserIds.length) {
        orFilters.unshift(
            { to_user_id: { [Op.in]: directoryDbUserIds } },
            { from_user_id: { [Op.in]: directoryDbUserIds } }
        );
    }

    return db.withDatabase(DIRECTORY_DB, async () =>
        Message.findAll({
            where: { [Op.or]: orFilters },
            order: [["createdAt", "DESC"]],
        })
    );
}

async function fetchLegacyMessages(activeDatabaseName, activeDbUserIds = []) {
    const normalizedDb = normalizeDatabaseName(activeDatabaseName);
    if (!normalizedDb || normalizedDb === DIRECTORY_DB || !Array.isArray(activeDbUserIds) || !activeDbUserIds.length) {
        return [];
    }

    try {
        await ensureMessageSchema(normalizedDb);
        return await db.withDatabase(normalizedDb, async () =>
            Message.findAll({
                where: {
                    [Op.or]: [
                        { to_user_id: { [Op.in]: activeDbUserIds } },
                        { from_user_id: { [Op.in]: activeDbUserIds } },
                        { to_user_id: null },
                    ],
                },
                order: [["createdAt", "DESC"]],
            })
        );
    } catch (_err) {
        return [];
    }
}

function toMessageResponse(messageLike, storageDatabaseName) {
    const plain = messageLike && typeof messageLike.toJSON === "function" ? messageLike.toJSON() : { ...(messageLike || {}) };
    return {
        ...plain,
        storage_database_name: storageDatabaseName,
        from_name: messageFallbackName(plain.from_user_ref, plain.from_user_id, plain.from_name || "System", "System"),
        to_name: plain.to_user_id == null && !plain.to_user_ref
            ? "All Users"
            : messageFallbackName(plain.to_user_ref, plain.to_user_id, plain.to_name),
    };
}

exports.getMessages = async (req,res)=>{
    try{
        const viewer = await buildViewerContext(req);
        const centralMessages = await fetchCentralMessages(viewer.refs, viewer.directoryDbUserIds);
        const legacyMessages = await fetchLegacyMessages(viewer.activeDatabaseName, viewer.activeDbUserIds);

        const rows = [];
        const seen = new Set();

        centralMessages.forEach((message) => {
            const mapped = toMessageResponse(message, DIRECTORY_DB);
            const key = `${mapped.storage_database_name}:${mapped.id}`;
            if (seen.has(key)) return;
            seen.add(key);
            rows.push(mapped);
        });

        legacyMessages.forEach((message) => {
            const mapped = toMessageResponse(message, viewer.activeDatabaseName);
            const key = `${mapped.storage_database_name}:${mapped.id}`;
            if (seen.has(key)) return;
            seen.add(key);
            rows.push(mapped);
        });

        rows.sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
        res.json(rows);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load messages." });
    }
};

exports.createMessage = async (req,res)=>{
    try{
        const title = String(req.body?.title || "").trim();
        const body = String(req.body?.body || "").trim();
        const activeDatabaseName = getActiveDatabaseName(req);
        const senderUserId = getRequesterUserId(req);
        const senderUserDatabase = getRequesterUserDatabase(req);
        const recipientRef = parseUserRef(
            req.body?.to_user_ref || req.body?.to_user_id,
            req.body?.to_user_database || activeDatabaseName
        );

        if(!title || !body || !recipientRef){
            return res.status(400).json({ message: "To, title, and message are required." });
        }

        await db.registerDatabase(senderUserDatabase).catch(() => {});
        await db.registerDatabase(recipientRef.user_database).catch(() => {});

        const senderUser = await db.withDatabase(senderUserDatabase, async () =>
            User.findByPk(senderUserId, { attributes: ["id", "username", "email"] })
        ).catch(() => null);
        const recipientUser = await db.withDatabase(recipientRef.user_database, async () =>
            User.findByPk(recipientRef.user_id, { attributes: ["id", "username", "email"] })
        ).catch(() => null);

        if (!recipientUser) {
            return res.status(404).json({ message: "Recipient user not found." });
        }

        await ensureMessageSchema(DIRECTORY_DB);

        const created = await db.withDatabase(DIRECTORY_DB, async () =>
            Message.create({
                title,
                body,
                to_user_id: recipientRef.user_id,
                to_user_ref: buildUserRef(recipientRef.user_database, recipientRef.user_id),
                to_user_database: recipientRef.user_database,
                to_name: userDisplayName(recipientUser, recipientRef.user_id),
                from_user_id: senderUserId || null,
                from_user_ref: buildUserRef(senderUserDatabase, senderUserId),
                from_user_database: senderUserDatabase,
                from_name: userDisplayName(senderUser, senderUserId),
            })
        );

        res.status(201).json(toMessageResponse(created, DIRECTORY_DB));
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to create message." });
    }
};

exports.deleteMessage = async (req,res)=>{
    try{
        const { id } = req.params;
        const storageDatabaseName = normalizeDatabaseName(req.query?.storage_db || DIRECTORY_DB);
        await ensureMessageSchema(storageDatabaseName);

        const msg = await db.withDatabase(storageDatabaseName, async () => Message.findByPk(id));
        if(!msg){
            return res.status(404).json({ message: "Message not found." });
        }

        if(req.user && String(req.user.role || "").toLowerCase() === "user"){
            const viewer = await buildViewerContext(req);
            const recipientMatches = viewer.refs.includes(String(msg.to_user_ref || "").trim())
                || viewer.activeDbUserIds.includes(Number(msg.to_user_id || 0))
                || viewer.directoryDbUserIds.includes(Number(msg.to_user_id || 0));
            const isBroadcast = !String(msg.to_user_ref || "").trim() && msg.to_user_id == null;
            if(!recipientMatches && !isBroadcast){
                return res.status(403).json({ message: "Forbidden: Insufficient permissions" });
            }
        }

        await msg.destroy();
        res.json({ message: "Message deleted successfully." });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to delete message." });
    }
};
