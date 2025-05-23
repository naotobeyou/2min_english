const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcryptjs'); 
const CallHistory = require('./models/CallHistory');
const blockRoutes = require('./routes/block');
const Room = require('./models/Room');
const User = require('./models/User');
const MatchingEntry = require('./models/MatchingEntry');



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
app.use(bodyParser.json()); 
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use('/block', blockRoutes);
app.use(express.json()); 

// MongoDB接続
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB 接続成功！'))
  .catch((err) => console.error('❌ 接続エラー:', err));


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

    const user = new User({ 
      username, 
      email, 
      password,
      level,
      purpose,
      hobbies,
      avatar
    });
    await user.save();
    req.session.userId = user._id;

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

  const blocked = req.query.blocked === '1';

  res.render('dashboard', { user, histories, blocked});

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

  // ✅ 30分以上前に作られた ended:true の古い Room を削除
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  const result = await Room.deleteMany({
    ended: true,
    $or: [{ user1: me._id }, { user2: me._id }],
    createdAt: { $lt: thirtyMinutesAgo }
  });

  console.log(`🧹 古いRoom削除数: ${result.deletedCount}`);

  // ✅ マッチングエントリが未登録なら登録
  const exists = await MatchingEntry.findOne({ userId: me._id });
  if (!exists) {
    await MatchingEntry.create({
      userId: me._id,
      level: me.level,
      hobbies: me.hobbies
    });
  }

  // ✅ 待機画面を表示（マッチング処理は Socket 側で処理）
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

    if (req.session.callEnded) {
    req.session.callEnded = false; // セッションフラグをリセット
    return res.redirect('/dashboard');
  }

  if (!req.session.userId) return res.redirect('/login');

  try {
    const room = await Room.findById(req.params.roomId).populate('user1 user2');
    if (!room) return res.status(404).send('ルームが見つかりません');

    const user = await User.findById(req.session.userId);
    if (!user) return res.send('ユーザーが見つかりません');

    // 相手を判定
    const partner =
      room.user1._id.toString() === user._id.toString()
        ? room.user2
        : room.user1;

    if (!partner) return res.send('相手の情報が見つかりません');

    res.render('call', {
      roomId: room._id.toString(),
      user,
      partner
    });
  } catch (err) {
    console.error('❌ /call エラー:', err);
    res.status(500).send('通話ページの表示に失敗しました');
  }
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

function findPartnerSocket(roomId, mySocketId) {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return null;

  for (const socketId of room) {
    if (socketId !== mySocketId) return socketId;
  }

  return null;
}

// 通話終了フラグ
app.post('/mark-ended', async (req, res) => {
  const roomId = req.body.roomId;
  console.log('📥 /mark-ended POST受信:', req.body);

  if (!roomId) {
    console.error('❌ roomId が undefined（req.body.roomId）');
    return res.status(400).send('roomId がありません');
  }

  try {
    const result = await Room.updateOne(
      { _id: roomId },
      { $set: { ended: true } }
    );
    console.log('🛠️ Room.updateOne 結果:', result);

    const updatedRoom = await Room.findById(roomId);
    console.log('📝 更新後のRoom:', updatedRoom);

    if (result.matchedCount === 0) {
      console.warn(`⚠️ 該当する Room(${roomId}) が見つかりませんでした`);
      return res.status(404).send('Room が存在しません');
    }

    console.log(`✅ Room ${roomId} を終了済みにマークしました`);
    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Room 終了マーク処理でエラー:', err);
    res.status(500).send('通話終了フラグの更新に失敗しました');
  }
});



//設定画面
app.get('/settings', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');

  const user = await User.findById(req.session.userId);
  if (!user) return res.send('ユーザーが見つかりません');

  res.render('settings', { user });
});

//パスワード再発行
const passwordRoutes = require('./routes/password');
app.use('/', passwordRoutes);

//通話終了画面
app.get('/end/:roomId', async (req, res) => {
  const { roomId } = req.params;
  const currentUserId = req.session.userId; // セッションに保存されている自分のID

  try {
    const room = await Room.findById(roomId).populate('user1 user2');
    if (!room) return res.status(404).send('ルームが見つかりません');

    const partner =
      room.user1._id.toString() === currentUserId
        ? room.user2
        : room.user1;

    res.render('end', {
      partner,
      roomId
    });
  } catch (err) {
    console.error('❌ /end エラー:', err);
    res.status(500).send('サーバーエラー');
  }
});



// WebRTC用ルーム制御

io.on('connection', (socket) => {

socket.on('join-waiting', async (userId) => {
  // 🧾 全ルームをログ出力
  const allRooms = await Room.find({});
  console.log('🧾 現在の全ルーム一覧:');
  allRooms.forEach(room => {
    console.log(`🛋️ RoomID: ${room._id}`);
    console.log(`   - user1: ${room.user1}`);
    console.log(`   - user2: ${room.user2}`);
    console.log(`   - ended: ${room.ended}`);
    console.log(`   - createdAt: ${room.createdAt}`);
  });

  // 🧹 古い未終了Room削除
  await Room.deleteMany({
    ended: false,
    createdAt: { $lt: new Date(Date.now() - 30 * 60 * 1000) }
  });

  try {
    console.log(`📡 ユーザー ${userId} が waiting に参加（socket: ${socket.id}）`);
    userSockets.set(userId, socket.id);

    const me = await User.findById(userId);
    if (!me) return;

    // ✅ 終了済みルームのクリーンアップ
    await Room.deleteMany({
      ended: true,
      $or: [{ user1: me._id }, { user2: me._id }]
    });

    // ✅ 未終了ルームチェック
    const activeRoom = await Room.findOne({
      ended: false,
      $or: [{ user1: me._id }, { user2: me._id }]
    });

    if (activeRoom) {
      console.warn(`🚫 ${userId} は既存のルーム ${activeRoom._id} に所属中（マッチング不可）`);
      console.log('🪪 Room情報:', activeRoom);
      return;
    } else {
      console.log(`✅ ${userId} は未所属でマッチング可能`);
    }

    // ブロック対象除外
    const blockedMe = await User.find({ blockedUsers: me._id }, '_id');
    const blockedMeIds = blockedMe.map(u => u._id.toString());
    const allBlockedIds = [...(me.blockedUsers || []).map(String), ...blockedMeIds];

    const others = await MatchingEntry.find({
      userId: { $ne: me._id, $nin: allBlockedIds }
    });

    let match = others.find(u => u.level === me.level && u.hobbies === me.hobbies);
    if (!match) match = others.find(u => u.level === me.level);
    if (!match) match = others.find(u => u.hobbies === me.hobbies);
    if (!match && others.length > 0) match = others[0];

    if (match) {
      const partnerSocketId = userSockets.get(match.userId.toString());

      if (partnerSocketId) {
        const newRoom = await Room.create({
          user1: me._id,
          user2: match.userId
        });

        const roomId = newRoom._id.toString();
        console.log(`🎯 マッチング成立！ ${me._id} ⇄ ${match.userId} → Room ${roomId}`);

        io.to(socket.id).emit('matched', roomId);
        io.to(partnerSocketId).emit('matched', roomId);

        await MatchingEntry.deleteMany({ userId: { $in: [me._id, match.userId] } });
      } else {
        console.log(`⚠️ 相手 ${match.userId} は未接続（partnerSocketIdなし）`);
      }
    } else {
      // 🔁 MatchingEntryをupsertで登録
      await MatchingEntry.updateOne(
        { userId: me._id },
        {
          $setOnInsert: {
            level: me.level,
            hobbies: me.hobbies
          }
        },
        { upsert: true }
      );
    }

  } catch (err) {
    console.error('🛑 join-waiting 処理中にエラー:', err);

    socket.emit('matching-error', {
      message: 'マッチング中にエラーが発生しました。ページを再読み込みしてください。',
      detail: err.message
    });
  }
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

  socket.on('request-extension', (roomId) => {
    socket.to(roomId).emit('extension-requested');
  });

  socket.on('topic-selected', ({ roomId, topic }) => {
    socket.to(roomId).emit('topic-selected', topic);
  });

  socket.on('pause', ({ roomId, username }) => {
    const partnerSocketId = findPartnerSocket(roomId, socket.id);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('partner-paused', username);
    }
  });
  
  socket.on('pause-time-update', ({ roomId, remainingPauseTime }) => {
    const partnerSocketId = findPartnerSocket(roomId, socket.id);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('pause-time-update', { remainingPauseTime });
    }
  });

  //一時停止の終了
  socket.on('resume', (roomId) => {
    const partnerSocketId = findPartnerSocket(roomId, socket.id);
    io.to(partnerSocketId).emit('partner-resumed');
  });
  
  socket.on('approve-extension', (roomId) => {
    io.to(roomId).emit('extension-approved');
  });

  socket.on('force-end', (roomId) => {
    socket.to(roomId).emit('force-end'); // 相手にだけ通知
  });


});





// 💡 最後の server.listen に変更
server.listen(3000, () => {
  console.log('http://localhost:3000 でサーバー起動中');
});


