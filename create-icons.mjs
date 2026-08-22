import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const outDir = '/Users/arhamsaghir/Documents/All Projects/project-9(app)/public/icons';

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#2563eb');
  gradient.addColorStop(1, '#1d4ed8');
  
  // Rounded rect background
  const radius = size * 0.1875; // 96/512 ratio
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, radius);
  ctx.fillStyle = gradient;
  ctx.fill();
  
  // Chart lines
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = size * 0.03125; // 16/512
  ctx.lineCap = 'round';
  
  const startX = size * 0.25;
  const startY = size * 0.39;
  const lineHeight = size * 0.03125;
  const gap = size * 0.0547;
  
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(size * 0.75, startY);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(startX, startY + gap);
  ctx.lineTo(size * 0.625, startY + gap);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(startX, startY + gap * 2);
  ctx.lineTo(size * 0.5, startY + gap * 2);
  ctx.stroke();
  
  // Chart border
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = size * 0.0156;
  ctx.beginPath();
  ctx.roundRect(size * 0.28, size * 0.31, size * 0.47, size * 0.375, size * 0.031);
  ctx.stroke();
  
  // Green dot
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(size * 0.75, size * 0.31, size * 0.023, 0, Math.PI * 2);
  ctx.fill();
  
  // Checkmark
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = size * 0.0195;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(size * 0.31, size * 0.69);
  ctx.lineTo(size * 0.41, size * 0.79);
  ctx.lineTo(size * 0.59, size * 0.56);
  ctx.stroke();
  
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(outDir, `icon-${size}x${size}.png`), buffer);
  console.log(`Created icon-${size}x${size}.png`);
}

console.log('All icons created!');
