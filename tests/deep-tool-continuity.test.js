const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../js/deep-canvas-manager.js'), 'utf8');
const context = vm.createContext({});
const DeepCanvasManager = vm.runInContext(`${source}\nDeepCanvasManager`, context);

function managerFor(tool) {
    const manager = Object.create(DeepCanvasManager.prototype);
    manager.tool = tool;
    manager.objects = [];
    manager.view = { x: 0, y: 0, zoom: 1 };
    manager.canvas = {};
    manager.viewport = {
        focus() {}, setPointerCapture() {}, releasePointerCapture() {},
        hasPointerCapture() { return true; },
        getBoundingClientRect() { return { left: 0, top: 0 }; }
    };
    manager.defaultColor = '#287db4';
    manager.defaultStrokeWidth = 5;
    manager.defaultFontSize = 50;
    manager.finishTextEdit = () => {};
    manager.snapshot = () => {};
    manager.changed = () => {};
    manager.render = () => {};
    manager.startTextEdit = () => {};
    manager.updateStyleControls = () => {};
    manager.hitTest = () => null;
    manager.newId = () => `object_${manager.objects.length + 1}`;
    manager.setTool = value => { manager.tool = value; };
    return manager;
}

function pointer(manager, x, y) {
    return { target: manager.canvas, button: 0, pointerId: 1, clientX: x, clientY: y, preventDefault() {} };
}

test('rectangle tool draws twice without being selected again', () => {
    const manager = managerFor('rectangle');
    for (const x of [10, 100]) {
        manager.pointerDown(pointer(manager, x, 10));
        manager.pointerMove(pointer(manager, x + 40, 50));
        manager.pointerUp(pointer(manager, x + 40, 50));
    }
    assert.equal(manager.tool, 'rectangle');
    assert.deepEqual(Array.from(manager.objects, object => object.type), ['rect', 'rect']);
});

test('text tool creates a second text object without being selected again', () => {
    const manager = managerFor('text');
    manager.pointerDown(pointer(manager, 10, 10));
    manager.pointerDown(pointer(manager, 100, 100));
    assert.equal(manager.tool, 'text');
    assert.deepEqual(Array.from(manager.objects, object => object.type), ['text', 'text']);
});
