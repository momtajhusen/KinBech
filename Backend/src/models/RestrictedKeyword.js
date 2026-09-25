const mongoose = require('mongoose');

const MATCH_FIELDS = ['title', 'description', 'brand', 'sku', 'location', 'category'];

const restrictedKeywordSchema = new mongoose.Schema(
  {
    keyword: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    matchFields: {
      type: [{ type: String, enum: MATCH_FIELDS }],
      default: ['title', 'description'],
      validate: {
        validator(arr) {
          return Array.isArray(arr) && arr.length > 0;
        },
        message: 'Select at least one match field',
      },
    },
    matchMode: {
      type: String,
      enum: ['contains', 'exact', 'word'],
      default: 'contains',
    },
    severity: {
      type: String,
      enum: ['hold', 'block'],
      default: 'hold',
      index: true,
    },
    isActive: { type: Boolean, default: true, index: true },
    notes: { type: String, default: '', trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RestrictedKeyword', restrictedKeywordSchema);
module.exports.MATCH_FIELDS = MATCH_FIELDS;
