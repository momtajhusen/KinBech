const mongoose = require('mongoose');

const aiModelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    enabled: { type: Boolean, default: true },
    // Gemini free tier allows a fixed number of requests per model per day.
    dailyLimit: { type: Number, default: 20, min: 0 },
    blockedUntil: { type: Date, default: null },
  },
  { _id: false }
);

const aiSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    // On: when a model runs out of quota the next enabled model is used.
    // Off: only the first enabled model is ever used.
    autoSwitch: { type: Boolean, default: true },
    models: { type: [aiModelSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AiSettings', aiSettingsSchema);
