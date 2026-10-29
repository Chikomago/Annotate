const test = require('node:test');
const assert = require('node:assert/strict');

function makeStorage(limit = Infinity) {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem(key, value) {
            if (value.length > limit) {
                const error = new Error('quota');
                error.name = 'QuotaExceededError';
                throw error;
            }
            values.set(key, value);
        },
        removeItem: key => values.delete(key)
    };
}

global.window = { indexedDB: null };
global.localStorage = makeStorage();
const ProjectManager = require('../js/project-manager.js');

test('failed image storage never claims the image is in IndexedDB', async () => {
    global.localStorage = makeStorage(500);
    const manager = new ProjectManager();
    const project = manager.createProject('test');
    const saved = await manager.saveProjectWithImage({ ...project, imageData: 'data:image/png;base64,' + 'A'.repeat(1000) });
    assert.equal(saved, false);
    assert.equal(manager.loadProject(project.id).imageInIndexedDB, undefined);
});

test('small image survives without IndexedDB through LocalStorage fallback', async () => {
    global.localStorage = makeStorage();
    const manager = new ProjectManager();
    const project = manager.createProject('test');
    const imageData = 'data:image/png;base64,AAAA';
    assert.equal(await manager.saveProjectWithImage({ ...project, imageData }), true);
    assert.equal((await manager.loadProjectWithImage(project.id)).imageData, imageData);
    assert.equal(manager.loadProject(project.id).imageInIndexedDB, false);
});

test('IndexedDB marker appears only after transaction completion', async () => {
    global.localStorage = makeStorage();
    const manager = new ProjectManager();
    const project = manager.createProject('test');
    let finishTransaction;
    manager.db = {
        transaction() {
            const transaction = { objectStore: () => ({ put() {} }) };
            finishTransaction = () => transaction.oncomplete();
            return transaction;
        }
    };
    manager._dbReady = Promise.resolve(true);
    const saving = manager.saveProjectWithImage({ ...project, imageData: 'data:image/png;base64,AAAA' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(manager.loadProject(project.id).imageInIndexedDB, undefined);
    finishTransaction();
    assert.equal(await saving, true);
    assert.equal(manager.loadProject(project.id).imageInIndexedDB, true);
});

test('server-stored image reopens after a new manager starts', async () => {
    global.localStorage = makeStorage(500);
    const first = new ProjectManager();
    const project = first.createProject('test');
    assert.equal(await first.saveProjectWithImage({
        ...project,
        imageData: 'data:image/png;base64,' + 'A'.repeat(1000),
        imageOnServer: true
    }), true);
    assert.equal(first.loadProject(project.id).imageData, null);

    global.fetch = async () => ({ ok: true, blob: async () => ({}) });
    global.FileReader = class {
        readAsDataURL() {
            this.result = 'data:image/png;base64,AAAA';
            this.onload();
        }
    };
    const reopened = await new ProjectManager().loadProjectWithImage(project.id);
    assert.equal(reopened.imageData, 'data:image/png;base64,AAAA');
});
