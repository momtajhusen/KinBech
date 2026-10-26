const mongoose = require('mongoose');

const modelBlockSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    blockedUntil: { type: Date, default: null },
  },
  { _id: false }
);

const aiAccountSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    apiKey: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    blockedUntil: { type: Date, default: null },
    lastError: { type: String, default: '' },
    modelBlocks: { type: [modelBlockSchema], default: [] },
  },
  { _id: false }
);

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
    accounts: { type: [aiAccountSchema], default: [] },
    // Cost caps: AI photo fills per user per day, and for the whole app per day.
    userDailyLimit: { type: Number, default: 15, min: 0 },
    globalDailyCap: { type: Number, default: 500, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AiSettings', aiSettingsSchema);
