const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true }
});


userSchema.pre('save', async function (next) {
  console.log('🧩 pre("save") が呼ばれたよ！');  // ← ここ追加！

  if (!this.isModified('password')) {
    console.log('🛑 パスワード変更されてないからスキップ！');
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(this.password, salt);
    this.password = hash;

    console.log('✅ パスワードをハッシュ化しました！');
    next();
  } catch (err) {
    console.log('❌ ハッシュ化中にエラー:', err);
    next(err);
  }
});

module.exports = mongoose.model('User', userSchema);