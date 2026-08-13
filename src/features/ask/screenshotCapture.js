const { desktopCapturer, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const util = require('node:util');

const execFile = util.promisify(require('node:child_process').execFile);

let sharp;
try {
    sharp = require('sharp');
    console.log('[ScreenshotCapture] Sharp module loaded successfully');
} catch (error) {
    console.warn('[ScreenshotCapture] Sharp is unavailable; native image processing will be used:', error.message);
    sharp = null;
}

let lastScreenshot = null;

function normalizeSelection(selection, display) {
    if (!selection || !display) return null;

    const left = Math.max(display.bounds.x, Math.floor(selection.x));
    const top = Math.max(display.bounds.y, Math.floor(selection.y));
    const right = Math.min(display.bounds.x + display.bounds.width, Math.ceil(selection.x + selection.width));
    const bottom = Math.min(display.bounds.y + display.bounds.height, Math.ceil(selection.y + selection.height));

    if (![left, top, right, bottom].every(Number.isFinite) || right - left < 2 || bottom - top < 2) {
        return null;
    }

    return { x: left, y: top, width: right - left, height: bottom - top };
}

async function processBuffer(imageBuffer, options = {}) {
    const isSelection = Boolean(options.selection);

    if (sharp) {
        try {
            const pipeline = sharp(imageBuffer);
            if (isSelection) {
                pipeline.resize({
                    width: 1600,
                    height: 1600,
                    fit: 'inside',
                    withoutEnlargement: true,
                });
            } else {
                pipeline.resize({ height: 384, withoutEnlargement: true });
            }

            const output = await pipeline.jpeg({ quality: 82 }).toBuffer();
            const metadata = await sharp(output).metadata();
            return { buffer: output, width: metadata.width, height: metadata.height };
        } catch (error) {
            console.warn('[ScreenshotCapture] Sharp processing failed; using the original JPEG:', error.message);
        }
    }

    return { buffer: imageBuffer, width: null, height: null };
}

async function captureMacScreenshot(selection) {
    const tempPath = path.join(os.tmpdir(), `glass-screenshot-${process.pid}-${Date.now()}.jpg`);
    const args = ['-x', '-t', 'jpg'];

    if (selection) {
        args.push(`-R${selection.x},${selection.y},${selection.width},${selection.height}`);
    }
    args.push(tempPath);

    try {
        await execFile('screencapture', args);
        const imageBuffer = await fs.promises.readFile(tempPath);
        return await processBuffer(imageBuffer, { selection });
    } finally {
        await fs.promises.unlink(tempPath).catch(() => {});
    }
}

function findCaptureSource(sources, display, displayIndex) {
    const displayId = String(display.id);
    return sources.find(source => String(source.display_id) === displayId) || sources[displayIndex] || sources[0];
}

async function captureDesktopScreenshot(selection, display) {
    const displays = screen.getAllDisplays();
    const displayIndex = Math.max(0, displays.findIndex(item => item.id === display.id));
    const targetSize = {
        width: Math.max(1, Math.round(display.bounds.width * display.scaleFactor)),
        height: Math.max(1, Math.round(display.bounds.height * display.scaleFactor)),
    };
    const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: targetSize,
    });

    if (sources.length === 0) {
        throw new Error('No screen sources are available.');
    }

    const source = findCaptureSource(sources, display, displayIndex);
    let image = source.thumbnail;

    if (selection) {
        const imageSize = image.getSize();
        const scaleX = imageSize.width / display.bounds.width;
        const scaleY = imageSize.height / display.bounds.height;
        const crop = {
            x: Math.max(0, Math.round((selection.x - display.bounds.x) * scaleX)),
            y: Math.max(0, Math.round((selection.y - display.bounds.y) * scaleY)),
            width: Math.max(1, Math.round(selection.width * scaleX)),
            height: Math.max(1, Math.round(selection.height * scaleY)),
        };
        crop.width = Math.min(crop.width, imageSize.width - crop.x);
        crop.height = Math.min(crop.height, imageSize.height - crop.y);
        image = image.crop(crop);
    }

    const size = image.getSize();
    const maxDimension = selection ? 1600 : 1080;
    if (Math.max(size.width, size.height) > maxDimension) {
        image = size.width >= size.height
            ? image.resize({ width: maxDimension, quality: 'best' })
            : image.resize({ height: maxDimension, quality: 'best' });
    }

    const buffer = image.toJPEG(82);
    const outputSize = image.getSize();
    return { buffer, width: outputSize.width, height: outputSize.height };
}

async function captureScreenshot(options = {}) {
    try {
        let selection = null;
        let display = null;

        if (options.selection) {
            display = screen.getAllDisplays().find(item => item.id === options.selection.displayId);
            if (!display) throw new Error('The selected display is no longer available.');
            selection = normalizeSelection(options.selection, display);
            if (!selection) throw new Error('The selected screenshot area is too small.');
        }

        let captured;
        if (process.platform === 'darwin') {
            captured = await captureMacScreenshot(selection);
        } else {
            display = display || screen.getPrimaryDisplay();
            captured = await captureDesktopScreenshot(selection, display);
        }

        const base64 = captured.buffer.toString('base64');
        lastScreenshot = {
            base64,
            width: captured.width,
            height: captured.height,
            timestamp: Date.now(),
        };

        return { success: true, base64, width: captured.width, height: captured.height };
    } catch (error) {
        console.error('[ScreenshotCapture] Failed to capture screenshot:', error);
        return { success: false, error: error.message };
    }
}

function getLastScreenshot() {
    return lastScreenshot;
}

module.exports = {
    captureScreenshot,
    getLastScreenshot,
    normalizeSelection,
};
