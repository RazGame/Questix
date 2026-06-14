const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  kind: String,
  title: String,
}, { timestamps: true });

const Game = mongoose.model('Game', gameSchema);

async function run() {
  const uri = 'mongodb://admin:password@mongodb:27017/quest?authSource=admin';
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
    
    const gameId = '6a2f1f5088b3aa47a635c0dc';
    const game = await Game.findById(gameId);
    if (!game) {
      console.log('Game not found');
      return;
    }
    
    console.log('Game before deletion:', game.title);
    
    // Test deleteOne
    const result = await game.deleteOne();
    console.log('Delete result:', result);
    
    const reload = await Game.findById(gameId);
    console.log('Reload after deletion:', reload ? 'Still exists' : 'Successfully deleted');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
