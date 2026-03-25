const UiSetting = require("../models/UiSetting");
const FIXED_FOOTER_TEXT = "\u00A9 All Right Recieved with CRONIT SOLLUTIONS - JMRP.";

async function getOrCreateSettings() {
  let row = await UiSetting.findOne({ order: [["id", "ASC"]] });
  if (!row) {
    row = await UiSetting.create({ footer_text: FIXED_FOOTER_TEXT });
    return row;
  }
  if (String(row.footer_text || "").trim() !== FIXED_FOOTER_TEXT) {
    await row.update({ footer_text: FIXED_FOOTER_TEXT });
  }
  return row;
}

exports.getPublicSettings = async (_req, res) => {
  try {
    const row = await getOrCreateSettings();
    const logoUpdatedAt = row.updatedAt ? row.updatedAt.toISOString() : "";
    res.json({
      app_name: row.app_name,
      footer_text: row.footer_text,
      primary_color: row.primary_color,
      accent_color: row.accent_color,
      background_color: row.background_color,
      button_color: row.button_color,
      mode_theme: row.mode_theme,
      logo_url: "/api/preferences/logo-file",
      logo_updated_at: logoUpdatedAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to load UI settings." });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const row = await getOrCreateSettings();
    const updates = {};

    if (req.body.app_name !== undefined) updates.app_name = String(req.body.app_name || "").trim() || row.app_name;
    if (req.body.footer_text !== undefined) updates.footer_text = String(req.body.footer_text || "").trim() || row.footer_text;
    if (req.body.primary_color !== undefined) updates.primary_color = String(req.body.primary_color || "").trim() || row.primary_color;
    if (req.body.accent_color !== undefined) updates.accent_color = String(req.body.accent_color || "").trim() || row.accent_color;
    if (req.body.background_color !== undefined) updates.background_color = String(req.body.background_color || "").trim() || row.background_color;
    if (req.body.button_color !== undefined) updates.button_color = String(req.body.button_color || "").trim() || row.button_color;
    if (req.body.mode_theme !== undefined) {
      const mode = String(req.body.mode_theme || "").trim().toLowerCase();
      updates.mode_theme = mode === "dark" ? "dark" : "light";
    }

    await row.update(updates);
    res.json({
      message: "UI settings updated",
      settings: {
        app_name: row.app_name,
        footer_text: row.footer_text,
        primary_color: row.primary_color,
        accent_color: row.accent_color,
        background_color: row.background_color,
        button_color: row.button_color,
        mode_theme: row.mode_theme,
        logo_url: "/api/preferences/logo-file",
        logo_updated_at: row.updatedAt ? row.updatedAt.toISOString() : "",
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to update UI settings." });
  }
};
