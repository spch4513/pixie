import { useState } from 'react';
import type { CameraFacing } from './types';
import { cameraSupportError } from './lib/camera';
import { PixieCamera } from './components/PixieCamera';
import { StartScreen } from './components/StartScreen';

export default function App() {
  // Camera permission is requested only after the user picks a camera.
  const [facing, setFacing] = useState<CameraFacing | null>(null);
  const [support] = useState(cameraSupportError);

  if (!facing) return <StartScreen onStart={setFacing} notice={support?.message ?? null} />;
  return <PixieCamera initialFacing={facing} onExit={() => setFacing(null)} />;
}
