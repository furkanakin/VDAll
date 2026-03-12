const { spawn } = require('child_process');
const path = require('path');
const { getBinaryPaths } = require('./utils');

/**
 * Merge separate audio and video files using ffmpeg
 * @param {string} videoPath - Path to video file
 * @param {string} audioPath - Path to audio file
 * @param {string} outputPath - Path for merged output
 * @returns {Promise<string>} - Path to merged file
 */
function mergeAudioVideo(videoPath, audioPath, outputPath) {
  return new Promise((resolve, reject) => {
    const bins = getBinaryPaths();

    const args = [
      '-i', videoPath,
      '-i', audioPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-y',
      outputPath,
    ];

    const proc = spawn(bins.ffmpeg, args, { windowsHide: true });

    let stderr = '';
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg merge failed (code ${code}): ${stderr.slice(-500)}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`FFmpeg not found: ${err.message}`));
    });
  });
}

module.exports = { mergeAudioVideo };
