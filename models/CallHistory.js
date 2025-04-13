// models/CallHistory.js
const mongoose = require('mongoose');

const callHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  roomId: String,
  note: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CallHistory', callHistorySchema);
