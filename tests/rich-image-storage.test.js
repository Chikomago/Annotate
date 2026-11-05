const test = require('node:test');
const assert = require('node:assert/strict');

test('project metadata keeps a rich image reference without a temporary blob URL', () => {
    global.window = {};
    const values = new Map();
    global.localStorage = {
        getItem: key => values.get(key) || null,
        setItem: (key, value) => values.set(key, value)
    };
    const ProjectManager = require('../js/project-manager.js');
    const manager = new ProjectManager();
    const content = '<p>说明<img src="blob:temporary" data-annotate-image-id="rich_1" width="100"></p>';

    assert.equal(manager.saveProject({ id: 'project_test', textBoxes: [{ content }] }), true);
    const stored = values.get('projects');
    assert.equal(stored.includes('blob:temporary'), false);
    assert.equal(manager.loadProject('project_test').textBoxes[0].content.includes('data-annotate-image-id="rich_1"'), true);
});
