import crypto from 'crypto';
import fs from 'fs';
import { logging } from './logging';

interface FileCache {
    id: string;
    hash: string;
    buffer: Buffer;
    lastCheck: Date;
    additionalData?: any;
}

const cachedFiles: FileCache[] = [];

function cleanup () {
    const now = new Date();
    for (let i = cachedFiles.length - 1; i >= 0; i--) {
        if (now.getTime() - cachedFiles[i].lastCheck.getTime() > 60000) {
            logging.info(`Removing cache: ${cachedFiles[i].id}`);
            cachedFiles.splice(i, 1);
        }
    }
}

function changeFileCacheId (oldId: string, newId: string) {
    const file = cachedFiles.find(file => file.id === oldId);
    if (file) {
        file.id = newId;
    }
}

function getFileFromCache (id: string): Buffer | null {
    const file = cachedFiles.find(file => file.id === id);
    if (file) {
        return file.buffer;
    }
    return null;
}

function setFileCacheFromCache (id: string, hash: string, buffer: Buffer, additionalData?: any) {
    logging.info(`Cache file: ${id} - ${hash}${additionalData ? ' - ' + JSON.stringify(additionalData) : ''}`);
    const now = new Date();
    cachedFiles.push({ id, hash, buffer, lastCheck: now, additionalData });
}

function setFileCacheFromCacheByFile (id: string, file: Buffer, additionalData?: any): string {
    const hash = crypto.createHash('sha256').update(file).digest('hex');
    setFileCacheFromCache(id, hash, file, additionalData);
    return hash;
}

function updateAdditionalData (id: string, additionalData: any): boolean {
    const file = cachedFiles.find(file => file.id === id);
    if (file) {
        file.additionalData = additionalData;
        return true;
    }
    return false;
}

function getFileCacheFromCache (id: string): FileCache | null {
    // Increase last check
    const now = new Date();
    const file = cachedFiles.find(file => file.id === id);
    if (file) {
        file.lastCheck = now;
        return file;
    }
    return null;
}

function removeFileCacheFromCache (id: string) {
    const index = cachedFiles.findIndex(file => file.id === id);
    if (index > -1) {
        cachedFiles.splice(index, 1);
    }
}

function sendHash (id: string, filePath: string, res: any) {

    // Check if hash exists
    const file = getFileCacheFromCache(id);
    if (file) {
        res.json({ hash: file.hash });
        return;
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
        logging.error(`File not found: ${filePath}`);
        res.status(404).send('Not Found');
        return;
    }

    // Generate hash
    const fileBuffer = fs.readFileSync(filePath);
    const hash = setFileCacheFromCacheByFile(id, fileBuffer);

    // Return hash
    res.json({ hash });
}

function sendHashWithBuffer (id: string, fileBuffer: Buffer, res: any) {

    // Check if hash exists
    const file = getFileCacheFromCache(id);
    if (file) {
        res.json({ hash: file.hash });
        return;
    }

    // Generate hash
    const hash = setFileCacheFromCacheByFile(id, fileBuffer);

    // Return hash
    res.json({ hash });
}


function getHash (id: string): string | null {

    // Check if hash exists
    const file = getFileCacheFromCache(id);
    if (file) {
        return file.hash;
    }

    return null;
}

setInterval(cleanup, 5000);

export { setFileCacheFromCache, getFileCacheFromCache, removeFileCacheFromCache, setFileCacheFromCacheByFile, updateAdditionalData, sendHash, changeFileCacheId, getFileFromCache, getHash, sendHashWithBuffer };