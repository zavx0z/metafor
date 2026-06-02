import { createCommandRouter, defaultVoiceCommands } from "../src/commands";
import { commandGrammar, defaultVoskModelPath, loadVosk, openVoskModel } from "../src/vosk";

const library = loadVosk();
library.symbols.vosk_set_log_level(-1);

const router = createCommandRouter(defaultVoiceCommands);
const model = openVoskModel(defaultVoskModelPath(), library);
const recognizer = model.createRecognizer({
  sampleRate: Number(Bun.env.VOSK_SAMPLE_RATE ?? 16_000),
  grammar: commandGrammar(router.recognitionPhrases),
});

recognizer.close();
model.close();
library.close();

console.log("ffi smoke ok");
