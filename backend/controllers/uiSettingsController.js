const UiSetting = require("../models/UiSetting");
const FIXED_FOOTER_TEXT = "\u00A9 All Right Recieved with CRONIT SOLLUTIONS - JMR Prasanna.";

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
    res.json({
      app_name: row.app_name,
      footer_text: row.footer_text,
      primary_color: row.primary_color,
      accent_color: row.accent_color,
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

    await row.update(updates);
    res.json({
      message: "UI settings updated",
      settings: {
        app_name: row.app_name,
        footer_text: row.footer_text,
        primary_color: row.primary_color,
        accent_color: row.accent_color,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Failed to update UI settings." });
  }
};
