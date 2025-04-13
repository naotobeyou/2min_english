const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcryptjs'); 
const CallHistory = require('./models/CallHistory');
require('dotenv').config();

const app = express();

//Socket.IO サーバー設定
const server = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

const userSockets = new Map();

app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false
}));



// ミドルウェア設定
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// MongoDB接続
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB 接続成功！'))
  .catch((err) => console.error('❌ 接続エラー:', err));

// モデル読み込み
const User = require('./models/User');
const MatchingEntry = require('./models/MatchingEntry');

// 新規登録ページ表示
app.get('/register', (req, res) => {
  res.render('register');
});


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });




// フォーム送信処理（DBに保存）
app.post('/register', upload.single('avatar'), async (req, res) => {
  console.log('📩 受け取ったデータ:', req.body);
  try {
    const { username, email, password, level, purpose, hobbies } = req.body;
    const avatar = req.file ? req.file.filename : 'default.png';


    if (!username || username.length < 3) {
      return res.send('<script>alert("ユーザー名は3文字以上で入力してください"); history.back();</script>');
    }
    
    if (!password || password.length < 6) {
      return res.send('<script>alert("パスワードは6文字以上で入力してください"); history.back();</script>');
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
    return res.send('<script>alert("正しいメールアドレスを入力してください"); history.back();</script>');
    }
    
    if (!level) {
      return res.send('<script>alert("英語レベルを選択してください"); history.back();</script>');
    }


     // 事前に同じユーザーが存在するかチェック
    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });
    
    if (existingUser) {
      if (existingUser.username === username) {
        return res.send(`
          <script>
            alert("⚠️ このユーザー名はすでに使われています！");
            history.back();
          </script>
        `);
      } else if (existingUser.email === email) {
        return res.send(`
          <script>
            alert("⚠️ このメールアドレスはすでに登録されています！");
            history.back();
          </script>
        `);
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({ 
      username, 
      email, 
      password: hashedPassword,
      level,
      purpose,
      hobbies,
      avatar
    });
    await user.save();

    console.log('保存されたユーザー:', user); // ここで確認！
    res.render('dashboard', { user }); 



  } catch (err) {
    console.error('❌ エラー内容:', JSON.stringify(err, null, 2));
  
    if (err.code === 11000) {
      if (err.keyPattern?.username || err.keyValue?.username) {
        return res.send(`
          <script>
            alert("⚠️ このユーザー名はすでに使われています！");
            history.back();
          </script>
        `);
      } else if (err.keyPattern?.email || err.keyValue?.email) {
        return res.send(`
          <script>
            alert("⚠️ このメールアドレスはすでに登録されています！");
            history.back();
          </script>
        `);
      } else {
        return res.send(`
          <script>
            alert("⚠️ 登録情報に重複があります！");
            history.back();
          </script>
        `);
      }
    }
  
    res.status(500).send('登録エラー');
  }
});

//ダッシュボードget
app.get('/dashboard', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  const user = await User.findById(req.session.userId);
  if (!user) return res.send('ユーザーが見つかりません');

  const histories = await CallHistory.find({ userId: user._id }).populate('partnerId').sort({ createdAt: -1 });

  res.render('dashboard', { user, histories });

});


//ログインget
app.get('/login', (req, res) => {
  res.render('login');
});




app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.send('<script>alert("ユーザーが見つかりません");history.back();</script>');
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.send('<script>alert("パスワードが間違っています");history.back();</script>');
    }

    // ログイン成功時
    req.session.userId = user._id;
    console.log('🧠 セッションの中身:', req.session);
    res.redirect('/dashboard');

  } catch (err) {
    console.error(err);
    res.status(500).send('ログインエラー');
  }
});


//ログアウト

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('ログアウトエラー:', err);
      return res.status(500).send('ログアウトできませんでした');
    }
    // 🔁 ログアウト後に /register にリダイレクト！
    res.redirect('/register');
  });
});


//プロフィール編集
app.get('/edit-profile', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  const user = await User.findById(req.session.userId);
  if (!user) return res.send('ユーザーが見つかりません');

  res.render('edit-profile', { user });
});

app.post('/edit-profile', upload.single('avatar'), async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');

  const { username, hobbies, purpose, currentPassword, newPassword } = req.body;

  if (!username || username.length < 3) {
    return res.send('<script>alert("ユーザー名は3文字以上で入力してください"); history.back();</script>');
  }

  if (hobbies && hobbies.length > 50) {
    return res.send('<script>alert("趣味は50文字以内で入力してください"); history.back();</script>');
  }

  if (purpose && purpose.length > 100) {
    return res.send('<script>alert("学習目的は100文字以内で入力してください"); history.back();</script>');
  }

  if (newPassword && newPassword.length < 6) {
    return res.send('<script>alert("新しいパスワードは6文字以上にしてください"); history.back();</script>');
  }

  try {
    const avatar = req.file ? req.file.filename : undefined;

    const updateData = { username, hobbies, purpose };
    if (avatar) updateData.avatar = avatar;

    const user = await User.findById(req.session.userId);

    if (currentPassword && newPassword) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.send('<script>alert("現在のパスワードが間違っています"); history.back();</script>');
      }
      user.password = newPassword;
    }

    Object.assign(user, updateData);
    await user.save();

    res.redirect('/dashboard');
  } catch (err) {
    console.error('❌ プロフィール更新エラー:', err);
    res.status(500).send('プロフィール更新失敗');
  }
});


app.get('/history', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');

  const myId = req.session.userId;

  const histories = await CallHistory.find({ userId: myId })
    .sort({ createdAt: -1 })
    .populate('partnerId');

  res.render('history', { histories });
});



// マッチング待機画面
app.get('/matching-wait', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');

  const me = await User.findById(req.session.userId);
  if (!me) return res.send('ユーザーが見つかりません');

  const others = await MatchingEntry.find({ userId: { $ne: me._id } });

  const exists = await MatchingEntry.findOne({ userId: me._id });
  if (!exists) {
    await MatchingEntry.create({
      userId: me._id,
      level: me.level,
      hobbies: me.hobbies
    });
  }

  let match = others.find(u => u.level === me.level && u.hobbies === me.hobbies);
  if (!match) match = others.find(u => u.level === me.level);
  if (!match) match = others.find(u => u.hobbies === me.hobbies);
  if (!match && others.length > 0) match = others[0];

  if (match) {
    const roomId = `${me._id}-${match.userId}`;
    const targetSocketId = userSockets.get(match.userId.toString());

    if (targetSocketId) {
      io.to(targetSocketId).emit('matched', roomId);
    }

    await MatchingEntry.deleteMany({ userId: { $in: [me._id, match.userId] } });
    return res.redirect(`/call/${roomId}`);
  }

  res.render('matching-wait', { user: me });
});



//マッチングキャンセル
app.post('/cancel-matching', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  await MatchingEntry.deleteOne({ userId: req.session.userId });
  res.redirect('/dashboard');
});

//マッチング成立時
app.get('/call/:roomId', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');

  const user = await User.findById(req.session.userId);
  if (!user) return res.send('ユーザーが見つかりません');

  const [id1, id2] = req.params.roomId.split('-');
  const partnerId = (id1 === user._id.toString()) ? id2 : id1;
  const partner = await User.findById(partnerId);

  if (!partner) return res.send('相手の情報が見つかりません');

  res.render('call', {
    roomId: req.params.roomId,
    user,
    partner
  });
});


//メモ・履歴保存
app.post('/save-note', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');

  const { roomId, partnerId, note } = req.body;

  try {
    await CallHistory.create({
      userId: req.session.userId,
      partnerId,
      roomId,
      note
    });

    res.redirect('/dashboard');
  } catch (err) {
    console.error('❌ メモ保存エラー:', err);
    res.status(500).send('メモの保存に失敗しました');
  }
});



// WebRTC用ルーム制御

io.on('connection', (socket) => {

  // ソケットIDとユーザーIDを紐づけ
  socket.on('join-waiting', (userId) => {
    console.log(`📡 ユーザー ${userId} が waiting に参加（socket: ${socket.id}）`);
    userSockets.set(userId, socket.id);
  });

  // 部屋に参加
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    const room = io.sockets.adapter.rooms.get(roomId);
    if (room && room.size === 2) {
      socket.to(roomId).emit('ready');
    }
  });

  // WebRTC シグナリング関連
  socket.on('offer', (roomId, offer) => {
    socket.to(roomId).emit('offer', offer);
  });

  socket.on('answer', (roomId, answer) => {
    socket.to(roomId).emit('answer', answer);
  });

  socket.on('ice-candidate', (roomId, candidate) => {
    socket.to(roomId).emit('ice-candidate', candidate);
  });

  socket.on('force-end', (roomId) => {
    socket.to(roomId).emit('force-end'); // 相手にだけ通知
  });


});


// 💡 最後の server.listen に変更
server.listen(3000, () => {
  console.log('http://localhost:3000 でサーバー起動中');
});


