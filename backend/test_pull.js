const mongoose = require('mongoose');

// Define Schema matching the Game schema
const gameSchema = new mongoose.Schema({
  kind: String,
  blocks: [
    {
      name: String,
      songIds: [mongoose.Schema.Types.ObjectId]
    }
  ]
}, { timestamps: true });

const Game = mongoose.model('Game', gameSchema);

async function run() {
  const uri = 'mongodb://admin:password@mongodb:27017/quest?authSource=admin';
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
    
    const gameId = '6a2f1f5088b3aa47a635c0dc';
    const blockId = '6a2f1f5088b3aa47a635c0dd'; // Блок 1
    
    const game = await Game.findById(gameId);
    if (!game) {
      console.log('Game not found');
      return;
    }
    
    console.log('Blocks before pull:', JSON.stringify(game.blocks, null, 2));
    
    const block = game.blocks.find((b) => String(b._id) === blockId);
    if (block) {
      console.log('Found block, pulling...');
      game.blocks.pull(block._id);
      await game.save();
      console.log('Saved successfully');
    } else {
      console.log('Block not found in game blocks');
    }
    
    const updatedGame = await Game.findById(gameId);
    console.log('Blocks after pull & reload:', JSON.stringify(updatedGame.blocks, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
