const mongoose = require('mongoose');

const errorEventSchema = new mongoose.Schema(
  {
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    stack: { type: String, default: '', maxlength: 20000 },
    name: { type: String, default: 'Error', trim: true },
    /** backend | mobile | website | admin */
    source: {
      type: String,
      enum: ['backend', 'mobile', 'website', 'admin', 'unknown'],
      default: 'backend',
      index: true,
    },
    severity: {
      type: String,
      enum: ['fatal', 'error', 'warning', 'info'],
      default: 'error',
      index: true,
    },
    statusCode: { type: Number, default: 500 },
    method: { type: String, default: '' },
    path: { type: String, default: '', index: true },
    route: { type: String, default: '' },
    url: { type: String, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    userLabel: { type: String, default: '' },
    requestId: { type: String, default: '', index: true },
    release: { type: String, default: '' },
    environment: { type: String, default: 'development' },
    platform: { type: String, default: '' },
    appVersion: { type: String, default: '' },
    device: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    extra: { type: mongoose.Schema.Types.Mixed, default: {} },
    breadcrumbs: { type: [mongoose.Schema.Types.Mixed], default: [] },
    sentryEventId: { type: String, default: '' },
    status: {
      type: String,
      enum: ['open', 'acknowledged', 'resolved', 'ignored'],
      default: 'open',
      index: true,
    },
    notes: { type: String, default: '', maxlength: 2000 },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    occurrenceCount: { type: Number, default: 1, min: 1 },
    lastSeenAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, collection: 'error_events' }
);

errorEventSchema.index({ createdAt: -1 });
errorEventSchema.index({ status: 1, severity: 1, createdAt: -1 });
errorEventSchema.index({ message: 1, path: 1, source: 1 });

module.exports = mongoose.model('ErrorEvent', errorEventSchema);
