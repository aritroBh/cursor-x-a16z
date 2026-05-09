import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { NvidiaVisionProvider } from '../src/main/vision/nvidiaVisionProvider';
import { VisionAnalyzeInput } from '../src/main/vision/types';

// Load environment variables from .env
dotenv.config();

async function runManualTest() {
  console.log('--- NVIDIA Vision Manual Test ---');

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || apiKey === 'your_nvidia_api_key_here') {
    console.error('Error: NVIDIA_API_KEY is not set in .env');
    process.exit(1);
  }

  // Use a fixture if it exists, otherwise use a placeholder or error
  const fixturePath = path.resolve(__dirname, '../test/fixtures/screenshot.png');
  let base64Image = '';

  if (fs.existsSync(fixturePath)) {
    console.log(`Using fixture: ${fixturePath}`);
    base64Image = fs.readFileSync(fixturePath).toString('base64');
  } else {
    console.warn('No screenshot fixture found at test/fixtures/screenshot.png');
    console.log('To run a real test, please place a PNG at that path.');
    console.log('Running with a tiny empty PNG placeholder for connectivity check...');
    // Tiny 1x1 transparent PNG
    base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  }

  const provider = new NvidiaVisionProvider();
  const input: VisionAnalyzeInput = {
    imageBase64: base64Image,
    mimeType: 'image/png',
    task: 'target_detection',
    userPrompt: 'Find any buttons'
  };

  try {
    const startTime = Date.now();
    const result = await provider.analyze(input);
    const duration = Date.now() - startTime;

    console.log('\n--- Result ---');
    console.log(`Provider: ${result.provider}`);
    console.log(`Model: ${result.model}`);
    console.log(`Latency: ${duration}ms (reported: ${result.latencyMs}ms)`);
    console.log(`Summary: ${result.summary}`);
    console.log(`Elements Found: ${result.elements.length}`);
    
    if (result.elements.length > 0) {
      console.log('Top Elements:');
      result.elements.slice(0, 3).forEach((el, i) => {
        console.log(`  ${i+1}. ${el.label} (${el.type}) at [${el.center?.x}, ${el.center?.y}]`);
      });
    }

    if (result.warnings.length > 0) {
      console.log('Warnings:', result.warnings);
    }

    console.log('\nSUCCESS: NVIDIA Vision API call completed.');
  } catch (error: any) {
    console.error('\n--- Error ---');
    console.error(`Code: ${error.code}`);
    console.error(`Message: ${error.message}`);
    if (error.safeDetails) {
      console.error(`Details: ${error.safeDetails}`);
    }
    process.exit(1);
  }
}

runManualTest();
