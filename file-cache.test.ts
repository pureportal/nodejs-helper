import fs from 'fs';
import crypto from 'crypto';

// Import Jest mocking functions
import { jest } from '@jest/globals';

// Mock the dependencies
jest.mock('fs');
jest.mock('crypto');

describe('file-cache Module', () => {
    // Reset mocks before each test
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules(); // Reset module registry to ensure a fresh cachedFiles array
    });

    /**
     * Helper function to import the module fresh
     */
    const importModule = async () => {
        return await import('./file-cache');
    };

    describe('setFileCacheFromCache', () => {
        it('should add a new file to the cache with correct properties', async () => {
            const { setFileCacheFromCache, getFileCacheFromCache } = await importModule();

            const id = 'file1';
            const hash = 'abcdef123456';
            const buffer = Buffer.from('File content');
            const additionalData = { author: 'John Doe' };

            setFileCacheFromCache(id, hash, buffer, additionalData);

            const cachedFile = getFileCacheFromCache(id);
            expect(cachedFile).not.toBeNull();
            expect(cachedFile?.id).toBe(id);
            expect(cachedFile?.hash).toBe(hash);
            expect(cachedFile?.buffer).toEqual(buffer);
            expect(cachedFile?.additionalData).toEqual(additionalData);
        });

        it('should add a new file without additionalData', async () => {
            const { setFileCacheFromCache, getFileCacheFromCache } = await importModule();

            const id = 'file2';
            const hash = '123456abcdef';
            const buffer = Buffer.from('Another file content');

            setFileCacheFromCache(id, hash, buffer);

            const cachedFile = getFileCacheFromCache(id);
            expect(cachedFile).not.toBeNull();
            expect(cachedFile?.additionalData).toBeUndefined();
        });
    });

    describe('getFileFromCache', () => {
        it('should return the buffer if file exists in cache', async () => {
            const { setFileCacheFromCache, getFileFromCache } = await importModule();

            const id = 'file1';
            const buffer = Buffer.from('Buffered content');
            setFileCacheFromCache(id, 'somehash', buffer);

            const result = getFileFromCache(id);
            expect(result).toEqual(buffer);
        });

        it('should return null if file does not exist in cache', async () => {
            const { getFileFromCache } = await importModule();

            const result = getFileFromCache('nonexistent');
            expect(result).toBeNull();
        });
    });

    describe('removeFileCacheFromCache', () => {
        it('should remove the file from cache if it exists', async () => {
            const { setFileCacheFromCache, removeFileCacheFromCache, getFileCacheFromCache } = await importModule();

            const id = 'file1';
            setFileCacheFromCache(id, 'hash', Buffer.from('data'));

            removeFileCacheFromCache(id);

            const cachedFile = getFileCacheFromCache(id);
            expect(cachedFile).toBeNull();
        });

        it('should do nothing if the file does not exist in cache', async () => {
            const { removeFileCacheFromCache } = await importModule();
            removeFileCacheFromCache('nonexistent');
        });
    });

    describe('setFileCacheFromCacheByFile', () => {
        it('should hash the buffer and add it to cache', async () => {
            const { setFileCacheFromCacheByFile, getFileCacheFromCache } = await importModule();

            const id = 'file1';
            const fileBuffer = Buffer.from('File content to hash');
            const mockHash = 'hashedvalue123';

            // Mock crypto.createHash behavior
            const updateMock = jest.fn().mockReturnThis();
            const digestMock = jest.fn().mockReturnValue(mockHash);
            (crypto.createHash as jest.Mock).mockReturnValue({
                update: updateMock,
                digest: digestMock,
            });

            const returnedHash = setFileCacheFromCacheByFile(id, fileBuffer);
            expect(returnedHash).toBe(mockHash);
            expect(crypto.createHash).toHaveBeenCalledWith('sha256');
            expect(updateMock).toHaveBeenCalledWith(fileBuffer);
            expect(digestMock).toHaveBeenCalled();

            const cachedFile = getFileCacheFromCache(id);
            expect(cachedFile).not.toBeNull();
            expect(cachedFile?.hash).toBe(mockHash);
            expect(cachedFile?.buffer).toEqual(fileBuffer);
        });
    });

    describe('updateAdditionalData', () => {
        it('should update additional data if the file exists', async () => {
            const { setFileCacheFromCache, updateAdditionalData, getFileCacheFromCache } = await importModule();

            const id = 'file1';
            setFileCacheFromCache(id, 'hash', Buffer.from('data'));

            const newAdditionalData = { version: '1.0.1' };
            const result = updateAdditionalData(id, newAdditionalData);
            expect(result).toBe(true);

            const cachedFile = getFileCacheFromCache(id);
            expect(cachedFile?.additionalData).toEqual(newAdditionalData);
        });

        it('should return false if the file does not exist in cache', async () => {
            const { updateAdditionalData } = await importModule();

            const result = updateAdditionalData('nonexistent', { key: 'value' });
            expect(result).toBe(false);
        });
    });

    describe('changeFileCacheId', () => {
        it('should change the ID of the cached file', async () => {
            const { setFileCacheFromCache, changeFileCacheId, getFileCacheFromCache } = await importModule();

            const oldId = 'oldFileId';
            const newId = 'newFileId';
            setFileCacheFromCache(oldId, 'hash', Buffer.from('data'));

            changeFileCacheId(oldId, newId);

            const oldFile = getFileCacheFromCache(oldId);
            expect(oldFile).toBeNull();

            const newFile = getFileCacheFromCache(newId);
            expect(newFile).not.toBeNull();
            expect(newFile?.id).toBe(newId);
            expect(newFile?.hash).toBe('hash');
        });

        it('should do nothing if the old ID does not exist', async () => {
            const { changeFileCacheId } = await importModule();

            changeFileCacheId('nonexistent', 'newId');
        });
    });

    describe('getFileCacheFromCache', () => {
        it('should return the cached file and update lastCheck', async () => {
            const { setFileCacheFromCache, getFileCacheFromCache } = await importModule();

            const id = 'file1';
            setFileCacheFromCache(id, 'hash', Buffer.from('data'));

            const cachedFileBefore = getFileCacheFromCache(id);
            expect(cachedFileBefore).not.toBeNull();
            const originalLastCheck = cachedFileBefore?.lastCheck;

            // Advance time by some milliseconds
            jest.spyOn(global.Date, 'now').mockImplementationOnce(() => originalLastCheck!.getTime() + 1000);

            const cachedFileAfter = getFileCacheFromCache(id);
            expect(cachedFileAfter?.lastCheck.getTime()).toBe(originalLastCheck!.getTime() + 1000);
        });

        it('should return null if the file does not exist in cache', async () => {
            const { getFileCacheFromCache } = await importModule();

            const cachedFile = getFileCacheFromCache('nonexistent');
            expect(cachedFile).toBeNull();
        });
    });

    describe('getHash', () => {
        it('should return the hash if the file exists in cache', async () => {
            const { setFileCacheFromCache, getHash } = await importModule();

            const id = 'file1';
            const hash = 'hashvalue';
            setFileCacheFromCache(id, hash, Buffer.from('data'));

            const result = getHash(id);
            expect(result).toBe(hash);
        });

        it('should return null if the file does not exist in cache', async () => {
            const { getHash } = await importModule();

            const result = getHash('nonexistent');
            expect(result).toBeNull();
        });
    });

    describe('sendHash', () => {
        let res: any;

        beforeEach(() => {
            res = {
                json: jest.fn(),
                status: jest.fn().mockReturnThis(),
                send: jest.fn(),
            };
        });

        it('should return hash from cache and respond with JSON', async () => {
            const { setFileCacheFromCache, sendHash } = await importModule();

            const id = 'file1';
            const hash = 'cachedHash';
            setFileCacheFromCache(id, hash, Buffer.from('data'));

            const filePath = '/path/to/file';
            const result = sendHash(id, filePath, res);

            expect(result).toBe(true);
            expect(res.json).toHaveBeenCalledWith({ hash });
            expect(fs.existsSync).not.toHaveBeenCalled();
            expect(fs.readFileSync).not.toHaveBeenCalled();
        });

        it('should read the file, cache it, and respond with hash if not in cache', async () => {
            const { sendHash } = await importModule();

            const id = 'file2';
            const filePath = '/path/to/file';
            const fileBuffer = Buffer.from('file content');
            const mockHash = 'newHash123';

            // Mock fs.existsSync and fs.readFileSync
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue(fileBuffer);

            // Mock crypto.createHash behavior
            const updateMock = jest.fn().mockReturnThis();
            const digestMock = jest.fn().mockReturnValue(mockHash);
            (crypto.createHash as jest.Mock).mockReturnValue({
                update: updateMock,
                digest: digestMock,
            });

            const result = sendHash(id, filePath, res);

            expect(fs.existsSync).toHaveBeenCalledWith(filePath);
            expect(fs.readFileSync).toHaveBeenCalledWith(filePath);
            expect(crypto.createHash).toHaveBeenCalledWith('sha256');
            expect(res.json).toHaveBeenCalledWith({ hash: mockHash });
            expect(result).toBe(true);
        });

        it('should respond with 404 if the file does not exist', async () => {
            const { sendHash, getFileCacheFromCache } = await importModule();

            const id = 'file3';
            const filePath = '/path/to/nonexistent';

            // We mock getFileCacheFromCache to return null
            (getFileCacheFromCache as jest.Mock).mockReturnValue(null);

            // Mock fs.existsSync to return false
            (fs.existsSync as jest.Mock).mockReturnValue(false);

            const result = sendHash(id, filePath, res);

            expect(fs.existsSync).toHaveBeenCalledWith(filePath);
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.send).toHaveBeenCalledWith('Not Found');
            expect(result).toBe(false);
        });
    });

    describe('sendHashWithBuffer', () => {
        let res: any;

        beforeEach(() => {
            res = {
                json: jest.fn(),
            };
        });

        it('should return hash from cache and respond with JSON', async () => {
            const { setFileCacheFromCache, sendHashWithBuffer } = await importModule();

            const id = 'file1';
            const hash = 'cachedHash';
            setFileCacheFromCache(id, hash, Buffer.from('data'));

            const buffer = Buffer.from('new data');
            sendHashWithBuffer(id, buffer, res);

            expect(res.json).toHaveBeenCalledWith({ hash });
        });

        it('should cache the buffer, generate a new hash, and respond with it if not in cache', async () => {
            const { sendHashWithBuffer, getHash } = await importModule();

            const id = 'file2';
            const buffer = Buffer.from('new file data');
            const mockHash = 'generatedHash456';

            sendHashWithBuffer(id, buffer, res);

            expect(res.json).toHaveBeenCalledWith({ hash: mockHash });

            const hashResult = getHash(id);
            expect(hashResult).toBe(mockHash);
        });
    });

    describe('cleanup', () => {
        jest.useFakeTimers(); // Use fake timers to control setInterval

        it('should remove cached files not checked in the last 60 seconds', async () => {
            const { setFileCacheFromCache, getFileCacheFromCache } = await importModule();

            const idOld = 'oldFile';
            const idRecent = 'recentFile';

            // Add an old file
            const oldDate = new Date(Date.now() - 30000); // 30 seconds ago
            setFileCacheFromCache(idOld, 'oldHash', Buffer.from('old data'));
            const cachedOldFile = getFileCacheFromCache(idOld);
            if (cachedOldFile) {
                cachedOldFile.lastCheck = oldDate;
            }

            // Add a recent file
            setFileCacheFromCache(idRecent, 'recentHash', Buffer.from('recent data'));

            // Advance timers by 31 seconds to trigger cleanup
            jest.advanceTimersByTime(31000);

            // Allow all pending timers to execute
            jest.runOnlyPendingTimers();

            // The old file should be removed
            const oldFile = getFileCacheFromCache(idOld);
            expect(oldFile).toBeNull();

            // The recent file should still exist
            const recentFile = getFileCacheFromCache(idRecent);
            expect(recentFile).not.toBeNull();
        });

        afterEach(() => {
            jest.useRealTimers(); // Restore real timers after tests
        });
    });
});