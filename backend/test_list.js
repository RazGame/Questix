const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  kind: String,
  title: String,
  createdBy: mongoose.Schema.Types.ObjectId,
  organizers: [mongoose.Schema.Types.ObjectId]
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  email: String,
  roles: [String],
  nickname: String
});

const Game = mongoose.model('Game', gameSchema);
const User = mongoose.model('User', userSchema);

async function run() {
  const uri = 'mongodb://admin:password@mongodb:27017/quest?authSource=admin';
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
    
    const users = await User.find();
    console.log('--- Users ---');
    users.forEach(u => {
      console.log(`ID: ${u._id}, Email: ${u.email}, Nickname: ${u.nickname}, Roles: ${JSON.stringify(u.roles)}`);
    });

    const games = await Game.find({ kind: 'guess_song' });
    console.log('--- Music Games ---');
    games.forEach(g => {
      console.log(`ID: ${g._id}, Title: ${g.title}, CreatedBy: ${g.createdBy}, Organizers: ${JSON.stringify(g.organizers)}`);
    });
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
