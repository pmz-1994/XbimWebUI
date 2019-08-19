﻿import { State } from './common/state';
import { ProductType } from './product-type';
import { ModelGeometry, Region } from './reader/model-geometry';
import { ModelHandle, DrawMode } from './model-handle';
import { Framebuffer } from './framebuffer';
import { ModelPointers } from './model-pointers';
import { worker as LoaderWorker } from './workers/worker';

// shaders GLSL 100 ES
import { fragment_shader } from './shaders/fragment_shader';
import { vertex_shader } from './shaders/vertex_shader';
// shaders GLSL 300 ES
import { fragment_shader_300 } from './shaders/fragment_shader_300';
import { vertex_shader_300 } from './shaders/vertex_shader_300';

//ported libraries
import { WebGLUtils } from './common/webgl-utils';
import { Message, MessageType } from './common/message';
import { ProductIdentity } from './common/product-identity';
import { IPlugin } from './plugins/plugin';
import { ViewerEventMap } from './common/viewer-event-map';
import { MouseNavigation } from './navigation/mouse-navigation';
import { KeyboardNavigation } from './navigation/keyboard-navigation';
import { TouchNavigation } from './navigation/touch-navigation';
import { CheckResult, Abilities } from './common/abilities';
import { Animations } from './navigation/animations';
import { mat4, vec3, mat3, quat } from 'gl-matrix';

export type NavigationMode = 'pan' | 'zoom' | 'orbit' | 'fixed-orbit' | 'free-orbit' | 'none' | 'look-around' | 'walk' | 'look-at';

export class Viewer {

    public gl: WebGLRenderingContext;
    public glVersion: number;
    public canvas: HTMLCanvasElement;
    public changed: boolean = false;
    /**
     * Switch between different navigation modes for left mouse button. Allowed values: <strong> 'pan', 'zoom', 'orbit' (or 'fixed-orbit') , 'free-orbit' and 'none'</strong>. Default value is <strong>'orbit'</strong>;
     * @member {String} Viewer#navigationMode
     */
    public navigationMode: NavigationMode = 'orbit';

    public get perspectiveCamera(): { fov: number, near: number, far: number } { return this._perspectiveCamera; }
    public set perspectiveCamera(value: { fov: number, near: number, far: number }) { this._perspectiveCamera = value; this.changed = true; }
    public get orthogonalCamera(): { left: number, right: number, top: number, bottom: number, near: number, far: number } { return this._orthogonalCamera; }
    public set orthogonalCamera(value: { left: number, right: number, top: number, bottom: number, near: number, far: number }) { this._orthogonalCamera = value; this.changed = true; }
    public get width(): number { return this._width; }
    public set width(value: number) { this._width = value; this.changed = true; }
    public get height(): number { return this._height; }
    public set height(value: number) { this._height = value; this.changed = true; }
    public get distance(): number { return this._distance; }
    public set distance(value: number) { this._distance = value; this.changed = true; }
    /**
     * Type of camera to be used. Available values are <strong>'perspective'</strong> and <strong>'orthogonal'</strong> You can change this value at any time with instant effect.
     * @member {string} Viewer#camera
     */
    public get camera(): CameraType { return this._camera; }
    public set camera(value: CameraType) { this._camera = value; this.changed = true; }
    /**
     * Array of four integers between 0 and 255 representing RGBA colour components. This defines background colour of the viewer. You can change this value at any time with instant effect.
     * @member {Number[]} Viewer#background
     */
    public get background(): number[] { return this._background; }
    public set background(value: number[]) { this._background = value; this.changed = true; }
    /**
     * Array of four integers between 0 and 255 representing RGBA colour components. This defines colour for highlighted elements. You can change this value at any time with instant effect.
     * @member {Number[]} Viewer#highlightingColour
     */
    public get highlightingColour(): number[] { return this._highlightingColour; }
    public set highlightingColour(value: number[]) { this._highlightingColour = value; this.changed = true; }

    /**
     * Coordinates in the WCS of the origin used for orbiting and panning [x, y, z]
     * @member {Number[]} Viewer#origin
     */
    public get origin(): vec3 { return this._origin; }
    public set origin(value: vec3) { this._origin = value; this.changed = true; }

    /**
     * World matrix
     * @member {Number[]} Viewer#mvMatrix
     */
    public get mvMatrix(): mat4 { return this._mvMatrix; }
    public set mvMatrix(value: mat4) { this._mvMatrix = value; this.changed = true; }

    /**
     * Camera matrix (perspective or orthogonal)
     * @member {Number[]} Viewer#pMatrix
     */
    public get pMatrix(): mat4 { return this._pMatrix; }
    public set pMatrix(value: mat4) { this._pMatrix = value; this.changed = true; }
    /**
     * Switch between different rendering modes.
     * @member {String} Viewer#renderingMode
     */
    public get renderingMode(): RenderingMode { return this._renderingMode; }
    public set renderingMode(value: RenderingMode) { this._renderingMode = value; this.changed = true; }

    /**
     * Returns readonly array of plugins
     * @member {IPlugin[]} Viewer#plugins
     */
    public get plugins(): IPlugin[] { return this._plugins.slice(); }

    /**
     * Returns number of units in active model (1000 is model is in mm)
     * @member {Number} Viewer#unitsInMeter
     */
    public get unitsInMeter(): number {
        const info = this.activeHandles.map(h => h.meter);
        if (info.length === 0) {
            return null;
        }
        return info[0];
    }

    /**
     * Number of milliseconds for animated zooming
     */
    public zoomDuration: number = 1000;

    /**
     * Animations functionality
     */
    public animations: Animations = new Animations(this);

    /**
     * Returns a filtered array of currently active handles
     */
    public get activeHandles() { return this._handles.filter((h) => { return h != null && !h.stopped && !h.empty; }); };

    private _perspectiveCamera: { fov: number, near: number, far: number };
    private _orthogonalCamera: { left: number, right: number, top: number, bottom: number, near: number, far: number }
    private _width: number;
    private _height: number;
    //Default distance for default views (top, bottom, left, right, front, back)
    private _distance: number = 0;
    private _camera: CameraType = CameraType.PERSPECTIVE;
    private _background: number[] = [230, 230, 230, 255];
    private _highlightingColour: number[] = [255, 173, 33, 255];
    private _origin: vec3 = vec3.create();
    private _mvMatrix: mat4 = mat4.create();
    private _pMatrix: mat4 = mat4.create();
    private _renderingMode: RenderingMode = RenderingMode.NORMAL;

    private _isRunning: boolean = false;
    private _stateStyles: Uint8Array;
    private _stateStyleTexture: WebGLTexture;
    private _plugins: IPlugin[] = [];
    //Array of handles which can eventually contain handles to one or more models.
    private _handles: ModelHandle[] = [];
    //shader program used for rendering
    private _shaderProgram: WebGLProgram = null;

    private _mvMatrixUniformPointer: WebGLUniformLocation;
    private _pMatrixUniformPointer: WebGLUniformLocation;
    private _lightUniformPointer: WebGLUniformLocation;
    private _colorCodingUniformPointer: WebGLUniformLocation;
    private _renderingModeUniformPointer: WebGLUniformLocation;
    private _highlightingColourUniformPointer: WebGLUniformLocation;
    private _stateStyleSamplerUniform: WebGLUniformLocation;

    // dictionary of named events which can be registered and unregistered by using '.on('eventname', callback)'
    // and '.off('eventname', callback)'. Registered call-backs are triggered by the viewer when important events occur.
    private _events: { [entName: string]: Array<(args: { message: string } | { event: Event, id: number, model: number } | { model: number, tag: any } | number) => void>; } = {};

    private _canvasListeners: { [evtName: string]: (event: Event) => any } = {};

    // pointers to WebGL shader attributes and uniforms
    private _pointers: ModelPointers;

    // cache of the request function. This should be kept from the constructor
    // which should run outside of any Zone in case zoning is in use (like in Angular where init in NgZone causes complete refresh on every frame in efect)
    private _requestAnimationFrame: (callback: FrameRequestCallback) => number;


    /**
    * This is constructor of the xBIM Viewer. It gets HTMLCanvasElement or string ID as an argument. Viewer will than be initialized 
    * in the context of specified canvas. Any other argument will throw exception. 
    * 
    * If any Zone technology is in use, this constructor should run in the root zone without any additional load. It has global event
    * handlers and hooks in document.mousemove, document.keyup, requestAnimationFrame and otherw which need to run fast and should not
    * cause any additional sideeffects (like data binding refresh in Angular)
    * @name Viewer
    * @constructor
    * @classdesc This is the main and the only class you need to load and render IFC models in wexBIM format. This viewer is part of
    * xBIM toolkit which can be used to create wexBIM files from IFC, ifcZIP and ifcXML. WexBIM files are highly optimized for
    * transmition over internet and rendering performance. Viewer uses WebGL technology for hardware accelerated 3D rendering and SVG for
    * certain kinds of user interaction. This means that it won't work with obsolete and non-standard-compliant browsers like IE10 and less.
    *
    * @param {string | HTMLCanvasElement} canvas - string ID of the canvas or HTML canvas element.
    */
    constructor(canvas: string | HTMLCanvasElement, errorHandler?: ({ message: string }) => void) {
        if (typeof (canvas) == 'undefined') {
            throw new Error('Canvas has to be defined');
        }

        if (typeof (canvas['nodeName']) != 'undefined' && canvas['nodeName'] === 'CANVAS') {
            this.canvas = <HTMLCanvasElement>canvas;
        }
        if (typeof (canvas) == 'string') {
            this.canvas = <HTMLCanvasElement>document.getElementById(<string>canvas);
        }
        if (this.canvas == null) {
            throw new Error('You have to specify canvas either as an ID of HTML element or the element itself');
        }

        if (errorHandler != null) {
            this.on('error', errorHandler);
        }

        // make sure WebGL2RenderingContext is defined even if not implemented
        if (!window['WebGL2RenderingContext']) {
            window['WebGL2RenderingContext'] = function () { };
        }

        /**
        * This is a structure that holds settings of perspective camera.
        * @member {PerspectiveCamera} Viewer#perspectiveCamera
        */
        /**
        * This is only a structure. Don't call the constructor.
        * @classdesc This is a structure that holds settings of perspective camera. If you want 
        * to switch viewer to use perspective camera set {@link Viewer#camera camera} to 'perspective'.
        * You can modify this but it is not necessary because sensible values are 
        * defined when geometry model is loaded with {@link Viewer#load load()} method. If you want to 
        * change these values you have to do it after geometry is loaded.
        * @class
        * @name PerspectiveCamera
        */
        this.perspectiveCamera = {
            /** @member {Number} PerspectiveCamera#fov - Field of view*/
            fov: 53,
            /** @member {Number} PerspectiveCamera#near - Near cutting plane*/
            near: 1,
            /** @member {Number} PerspectiveCamera#far - Far cutting plane*/
            far: 100
        };

        /**
        * This is a structure that holds settings of orthogonal camera. You can modify this but it is not necessary because sensible values are 
        * defined when geometry model is loaded with {@link Viewer#load load()} method. If you want to change these values you have to do it after geometry is loaded.
        * @member {OrthogonalCamera} Viewer#orthogonalCamera
        */
        /**
        * This is only a structure. Don't call the constructor.
        * @classdesc This is a structure that holds settings of orthogonal camera. If you want to switch viewer to use orthogonal camera set {@link Viewer#camera camera} to 'orthogonal'.
        * @class
        * @name OrthogonalCamera
        */
        this.orthogonalCamera = {
            /** @member {Number} OrthogonalCamera#left*/
            left: 0,
            /** @member {Number} OrthogonalCamera#right*/
            right: 0,
            /** @member {Number} OrthogonalCamera#top*/
            top: 0,
            /** @member {Number} OrthogonalCamera#bottom*/
            bottom: 0,
            /** @member {Number} OrthogonalCamera#near*/
            near: 0,
            /** @member {Number} OrthogonalCamera#far*/
            far: 0
        };


        //*************************** Do all the set up of WebGL **************************
        WebGLUtils.setupWebGL(this.canvas, (ctx, version) => {
            this.gl = ctx;
            this.glVersion = version;
        }, { preserveDrawingBuffer: true }, err => {
            this.error(err);
        });

        //do not even initialize this object if WebGL is not supported
        if (!this.gl) {
            this.error("Unable to set up WebGL");
            return;
        }


        // keep reference to the function in case it gets into zone. For example Angular uses
        // NgZone forked from the root Zone to refresh data content. But we make heavy use of this
        // asynchronous call and it would cause Angular to refresh constantly. That would innecessary increase
        // CPU load.
        this._requestAnimationFrame = (window.requestAnimationFrame ||
            window.webkitRequestAnimationFrame ||
            window["mozRequestAnimationFrame"] ||
            window["oRequestAnimationFrame"] ||
            window["msRequestAnimationFrame"] ||
            function (/* function FrameRequestCallback */ callback) {
                window.setTimeout(callback, 1000 / 60);
            }).bind(window);

        let gl = this.gl;
        let fptSupport = false;

        //detect floating point texture support
        if (this.glVersion < 2) {
            fptSupport = (
                gl.getExtension('OES_texture_float') ||
                gl.getExtension('MOZ_OES_texture_float') ||
                gl.getExtension('WEBKIT_OES_texture_float')
            );
        } else {
            fptSupport = true;
        }

        if (!fptSupport) {
            this.error("Floating point texture support required.");
            return;
        }


        //set up DEPTH_TEST and BLEND so that transparent objects look right
        //this is not 100% perfect as it would be necessary to sort all objects from back to
        //front when rendering them. We have sacrificed this for the sake of performance.
        //Objects with no transparency in their default style are drawn first and semi-transparent last.
        //This gives 90% right when there is not too much of transparency. It may not look right if you
        //have a look through two windows or if you have a look from inside of the building out.
        //It is granted to be alright when looking from outside of the building inside through one
        //semi-transparent object like curtain wall panel or window which is the case most of the time.
        //This is known limitation but there is no plan to change this behaviour.
        gl.enable(gl.DEPTH_TEST);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.BLEND);

        //cache canvas width and height and change it only when size change
        // it is better to cache this value because it is used frequently and it takes a time to get a value from HTML
        this.width = this.canvas.width = this.canvas.offsetWidth;
        this.height = this.canvas.height = this.canvas.offsetHeight;

        //********************** Run all the initialize functions *****************************
        //compile shaders for use
        this._initShaders();
        //initialize vertex attribute and uniform pointers
        this._initAttributesAndUniforms();
        //initialize mouse events to capture user interaction
        MouseNavigation.initMouseEvents(this);
        //initialize keyboard events to capture user interaction
        KeyboardNavigation.initKeyboardEvents(this);
        //initialize touch events to capute user interaction on touch devices
        TouchNavigation.initTouchNavigationEvents(this);
        TouchNavigation.initTouchTapEvents(this);

        // listen to all mouse and touch events of the canvas and enrich the information
        // with product ID and model ID
        //disable default context menu as it doesn't make much sense for the viewer
        //it can be replaced by custom menu when listening to 'contextMenu' of the viewer
        this._disableContextMenu();

        //This array keeps data for overlay styles.
        this._stateStyles = new Uint8Array(15 * 15 * 4);
        this._stateStyleTexture = gl.createTexture();

        //this texture has constant size and is bound at all times
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, this._stateStyleTexture);
        gl.uniform1i(this._stateStyleSamplerUniform, 4);

        //this has a constant size 15 which is defined in vertex shader
        ModelHandle.bufferTexture(gl, this._stateStyleTexture, this._stateStyles);

        // watch resizing on every frame
        let elementHeight = this.height;
        let elementWidth = this.width;
        const watchCanvasSize = () => {
            if (this.canvas.offsetHeight !== elementHeight || this.canvas.offsetWidth !== elementWidth) {
                elementHeight = this.height = this.canvas.height = this.canvas.offsetHeight;
                elementWidth = this.width = this.canvas.width = this.canvas.offsetWidth;
            }
            this._requestAnimationFrame(watchCanvasSize);
        };
        watchCanvasSize();

        this.animations = new Animations(this);
    }

    /**
    * This is a static function which should always be called before Viewer is instantiated.
    * It will check all prerequisites of the viewer and will report all issues. If Prerequisities.errors contain
    * any messages viewer won't work. If Prerequisities.warnings contain any messages it will work but some
    * functions may be restricted or may not work or it may have poor performance.
    * @function Viewer.check
    * @return {Prerequisites}
    */
    public static check(): CheckResult {
        return Abilities.check();
    }

    /**
    * Adds plugin to the viewer. Plugins can implement certain methods which get called in certain moments in time like
    * before draw, after draw etc. This makes it possible to implement functionality tightly integrated into Viewer like navigation cube or others. 
    * @function Viewer#addPlugin
    * @param {object} plugin - plug-in object
    */
    public addPlugin(plugin: IPlugin) {
        if (!plugin.init) return;

        plugin.init(this);
        this._plugins.push(plugin);
        this.changed = true;
    }

    /**
    * Removes plugin from the viewer. Plugins can implement certain methods which get called in certain moments in time like
    * before draw, after draw etc. This makes it possible to implement functionality tightly integrated into Viewer like navigation cube or others. 
    * @function Viewer#removePlugin
    * @param {object} plugin - plug-in object
    */
    public removePlugin(plugin: IPlugin) {
        var index = this._plugins.indexOf(plugin, 0);
        if (index < 0) return;
        this._plugins.splice(index, 1);
        this.changed = true;
    }

    /**
    * Use this function to define up to 224 optional styles which you can use to change appearance of products and types if you pass the index specified in this function to {@link Viewer#setState setState()} function.
    * @function Viewer#defineStyle
    * @param {Number} index - Index of the style to be defined. This has to be in range 0 - 224. Index can than be passed to change appearance of the products in model
    * @param {Number[]} colour - Array of four numbers in range 0 - 255 representing RGBA colour. If there are less or more numbers exception is thrown.
    */
    public defineStyle(index: number, colour: number[]) {
        if (typeof (index) == 'undefined' || (index < 0 && index > 224)) {
            throw new Error('Style index has to be defined as a number 0-224')
        }
        if (typeof (colour) == 'undefined' || !colour.length || colour.length != 4) {
            throw new Error('Colour must be defined as an array of 4 bytes');
        }

        //set style to style texture via model handle
        var colData = new Uint8Array(colour);
        this._stateStyles.set(colData, index * 4);

        //reset data in GPU
        let gl = this.setActive();

        //update overlay styles
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, this._stateStyleTexture);
        ModelHandle.bufferTexture(gl, this._stateStyleTexture, this._stateStyles);

        //set flag
        this.changed = true;
    }

    /**
    * You can use this function to change state of products in the model. State has to have one of values from {@link xState xState} enumeration. 
    * Target is either enumeration from {@link xProductType xProductType} or array of product IDs. If you specify type it will effect all elements of the type.
    *
    * @function Viewer#setState
    * @param {State} state - One of {@link State State} enumeration values.
    * @param {Number} [modelId] - Id of the model
    * @param {Number[] | Number} target - Target of the change. It can either be array of product IDs or product type from {@link xProductType xProductType}.
    */
    public addState(state: State, target: number | number[], modelId?: number) {
        if (typeof (state) == 'undefined' || !(state >= 225 && state <= 255)) {
            throw new Error('State has to be defined as 225 - 255. Use State enum.');
        }
        if (typeof (target) === 'undefined' || target === null) {
            throw new Error('Target must be defined either as type ID or as a list of product IDs');
        }

        this.forHandleOrAll((h: ModelHandle) => { h.addState(state, target); }, modelId);
        this.changed = true;
    }

    public setState(state: State, target: number | number[], modelId?: number) {
        if (typeof (state) == 'undefined' || !(state >= 225 && state <= 255)) {
            throw new Error('State has to be defined as 225 - 255. Use State enum.');
        }
        if (typeof (target) === 'undefined' || target === null) {
            throw new Error('Target must be defined either as type ID or as a list of product IDs');
        }

        this.forHandleOrAll((h: ModelHandle) => { h.setState(state, target); }, modelId);
        this.changed = true;
    }

    public removeState(state: State, target: number | number[], modelId?: number) {
        if (typeof (state) == 'undefined' || !(state >= 225 && state <= 255)) {
            throw new Error('State has to be defined as 225 - 255. Use State enum.');
        }
        if (typeof (target) === 'undefined' || target === null) {
            throw new Error('Target must be defined either as type ID or as a list of product IDs');
        }

        this.forHandleOrAll((h: ModelHandle) => { h.removeState(state, target); }, modelId);
        this.changed = true;
    }

    /**
   * Use this function to get state of the products in the model. You can compare result of this function 
   * with one of values from {@link xState xState} enumeration. 0xFF is the default value.
   *
   * @function Viewer#getState
   * @param {Number} id - Id of the product. You would typically get the id from {@link Viewer#event:pick pick event} or similar event.
   * @param {Number} [modelId] - Id of the model
   */
    public getState(id: number, modelId?: number): number {
        return this.forHandleOrAll((h: ModelHandle) => {
            return h.getState(id);
        }, modelId);
    }

    /**
    * Use this function to reset state of all products to 'UNDEFINED' which means visible and not highlighted. 
    * You can use optional hideSpaces parameter if you also want to show spaces. They will be hidden by default.
    * 
    * @function Viewer#resetStates
    * @param {Number[] | Number} target - Target of the change. It can either be array of product IDs or product type from {@link xProductType xProductType}.
    * @param {Number} [modelId = null] - Optional Model ID. Id no ID is specified states are reset for all models.
    */
    public resetState(target: number | number[], modelId?: number) {
        this.forHandleOrAll((h: ModelHandle) => {
            h.resetState(target);
        }, modelId);

        this.changed = true;
    }

    /**
     * Executes callback for one model if modelId is specified or for all handles.
     * If no modelId is specified, last result will get returned, not an aggregation.
     * @param callback Function to execute
     * @param modelId ID of the model
     */
    private forHandleOrAll<T>(callback: (h: ModelHandle) => T, modelId?: number): T {
        if (modelId != null) {
            let handle = this.getHandle(modelId);
            if (!handle) {
                throw new Error(`Model with id '${modelId}' doesn't exist.`);
            }
            return callback(handle);
        } else {
            let result: T = null;
            this._handles.forEach((handle) => {
                if (handle) {
                    let value = callback(handle);
                    if (value != null) {
                        result = value;
                    }
                }
            });
            return result;
        }
    }

    private getHandle(id: number): ModelHandle {
        return this._handles.filter((h) => h != null && h.id == id).pop();
    }

    public getCurrentImageHtml(width: number = this.width, height: number = this.height): HTMLImageElement {
        var element = document.createElement("img") as HTMLImageElement;
        element.src = this.getCurrentImageDataUrl(width, height);
        return element;
    }

    public getCurrentImageDataUrl(width: number = this.width, height: number = this.height): string {
        //use background framebuffer
        let frame = new Framebuffer(this.gl, width, height);

        //force draw into defined framebuffer
        this.draw(frame);

        let result = frame.getImageDataUrl();
        //free resources
        frame.delete();
        return result;
    }

    public getCurrentImageDataArray(width: number = this.width, height: number = this.height): Uint8ClampedArray {
        //use background framebuffer
        let frame = new Framebuffer(this.gl, width, height);

        //force draw into defined framebuffer
        this.draw(frame);

        let result = frame.getImageDataArray();
        //free resources
        frame.delete();
        return result;
    }

    public getCurrentImageBlob(callback: (blob: Blob) => void): void {
        return this.canvas.toBlob(callback, 'image/png');
    }


    public getProductsStates(modelId: number): Array<{ id: number, states: State[] }> {
        var handle = this.getHandle(modelId);
        if (handle == null) {
            throw new Error(`Model '${modelId}' doesn't exist`);
        }
        return handle.getStates();
    }

    public restoreProductsStates(modelId: number, stateMap: Array<{ id: number, states: State[] }>): void {
        var handle = this.getHandle(modelId);
        if (handle == null) {
            throw new Error(`Model '${modelId}' doesn't exist`);
        }

        handle.resetState();
        stateMap.forEach(sm => {
            sm.states.forEach(s => {
                handle.addState(s, [sm.id]);
            });
        });
    }

    /**
     * Gets complete model state and style. Resulting object can be used to restore the state later on.
     * 
     * @param {Number} modelId - Model ID which you can get from {@link Viewer#event:loaded loaded} event.
     * @returns {Array} - Array representing model state in compact form suitable for serialization
     */
    public getModelState(modelId: number): Array<Array<number>> {
        var handle = this.getHandle(modelId);
        if (handle == null) {
            throw new Error(`Model '${modelId}' doesn't exist`);
        }
        return handle.getModelState();
    }

    /**
     * Restores model state from the data previously captured with {@link Viewer#getModelState getModelState()} function
     * @param {Number} modelId - ID of the model
     * @param {Array} state - State of the model as obtained from {@link Viewer#getModelState getModelState()} function
     */
    public restoreModelState(modelId: number, state: Array<Array<number>>) {
        var handle = this.getHandle(modelId);
        if (handle == null) {
            throw new Error(`Model '${modelId}' doesn't exist`);
        }

        handle.restoreModelState(state);
        this.changed = true;
    }

    /**
    * Use this method for restyling of the model. This doesn't change the default appearance of the products so you can think about it as an overlay. You can 
    * remove the overlay if you set the style to {@link State#UNSTYLED State.UNSTYLED} value. You can combine restyling and hiding in this way. 
    * Use {@link Viewer#defineStyle defineStyle()} to define styling first. 
    * 
    * @function Viewer#setStyle
    * @param style - style defined in {@link Viewer#defineStyle defineStyle()} method
    * @param {Number[] | Number} target - Target of the change. It can either be array of product IDs or product type from {@link xProductType xProductType}.
    * @param {Number} [modelId] - Optional ID of a specific model.
    */
    public setStyle(style: number, target: number | number[], modelId?: number) {
        if (typeof (style) == 'undefined' || !(style >= 0 && style <= 225)
        ) {
            throw new Error('Style has to be defined as 0 - 225 where 225 is for default style.');
        }
        var c = [
            this._stateStyles[style * 4],
            this._stateStyles[style * 4 + 1],
            this._stateStyles[style * 4 + 2],
            this._stateStyles[style * 4 + 3]
        ];
        if (c[0] == 0 && c[1] == 0 && c[2] == 0 && c[3] == 0 && console && console.warn)
            console
                .warn('You have used undefined colour for restyling. Elements with this style will have transparent black colour and hence will be invisible.');

        this.forHandleOrAll((handle: ModelHandle) => {
            handle.setStyle(style, target);
        }, modelId);

        this.changed = true;
    }

    /**
    * Use this function to get overriding colour style of the products in the model. The number you get is the index of 
    * your custom colour which you have defined in {@link Viewer#defineStyle defineStyle()} function. 0xFF is the default value.
    *
    * @function Viewer#getStyle
    * @param {Number} id - Id of the product. You would typically get the id from {@link Viewer#event:pick pick event} or similar event.
    * @param {Number} [modelId] - Optional Model ID. If not defined first style available for a product with certain ID will be returned. This might be ambiguous.
    */
    public getStyle(id: number, modelId?: number) {
        this.forHandleOrAll((handle: ModelHandle) => {
            return handle.getStyle(id);
        }, modelId);
    }

    /**
    * Use this function to reset appearance of all products to their default styles.
    *
    * @function Viewer#resetStyles 
    * @param {Number} [modelId] - Optional ID of a specific model.
    */
    public resetStyles(modelId?: number): void {
        this.forHandleOrAll((handle: ModelHandle) => {
            handle.resetStyles();
        }, modelId);

        this.changed = true;
    }

    /**
    * 
    * @function Viewer#getProductType
    * @param {Number} prodID - Product ID. You can get this value either from semantic structure of the model or by listening to {@link Viewer#event:pick pick} event.
    * @param {Number} [modelId] - Optional Model ID. If not defined first type of a product with certain ID will be returned. This might be ambiguous.
    * @return {Number} Product type ID. This is either null if no type is identified or one of {@link xProductType type ids}.
    */
    public getProductType(prodId: number, modelId?: number): number {
        return this.forHandleOrAll((handle: ModelHandle) => {
            let map = handle.getProductMap(prodId);
            if (map) {
                return map.type;
            }
        }, modelId);
    }

    /**
    * Use this method to set position of camera. Use it after {@link Viewer#setCameraTarget setCameraTarget()} to get desired result.
    * 
    * @function Viewer#setCameraPosition
    * @param {Number[]} coordinates - 3D coordinates of the camera in WCS
    * @param {Number} [duration] - milliseconds for animation. 0 by default
    */
    public setCameraPosition(coordinates: number[], duration: number = 0) {
        if (typeof (coordinates) == 'undefined') {
            throw new Error('Parameter coordinates must be defined');
        }
        const mv = mat4.lookAt(mat4.create(), coordinates, this.origin, [0, 0, 1]);
        this.animations.viewTo(mv, duration);
    }

    /**
    * This method sets navigation origin to the centroid of specified product's bounding box or to the centre of model if no product ID is specified.
    * This method doesn't affect the view itself but it has an impact on navigation. Navigation origin is used as a centre for orbiting and it is used
    * if you call functions like {@link Viewer.show show()} or {@link Viewer#zoomTo zoomTo()}.
    * @function Viewer#setCameraTarget
    * @param {Number} prodId [optional] Product ID. You can get ID either from semantic structure of the model or from {@link Viewer#event:pick pick event}.
    * @param {Number} [modelId] - Optional ID of a specific model.
    * @return {Bool} True if the target exists and is set, False otherwise
    */
    public setCameraTarget(prodId?: number, modelId?: number): boolean {
        var viewer = this;
        //helper function for setting of the distance based on camera field of view and size of the product's bounding box
        var setDistance = (bBox: number[] | Float32Array) => {
            let size = Math.sqrt(bBox[3] * bBox[3] + bBox[4] * bBox[4] + bBox[5] * bBox[5]);
            //set ratio to 1 if the viewer has no size (for example if canvas is not added to DOM yet)
            let ratio = (viewer.width > 0 && viewer.height > 0) && viewer.width < viewer.height ?
                Math.min(viewer.width, viewer.height) / Math.max(viewer.width, viewer.height) :
                1;
            viewer.distance = size / (Math.tan(viewer.perspectiveCamera.fov * Math.PI / 180.0 / 2.0 * ratio) * 2.0);
        }

        //set navigation origin and default distance to the product BBox
        if (prodId != null) {
            const wcs = this.getCurrentWcs();
            //get product BBox and set it's centre as a navigation origin
            let bbox = this.forHandleOrAll((handle: ModelHandle) => {
                let map = handle.getProductMap(prodId, wcs);
                if (map) {
                    return map.bBox;
                }
            }, modelId);
            if (bbox) {
                this.origin = vec3.fromValues(bbox[0] + bbox[3] / 2.0, bbox[1] + bbox[4] / 2.0, bbox[2] + bbox[5] / 2.0);
                setDistance(bbox);
                return true;
            } else
                return false;
        }
        //set navigation origin and default distance to the merged region composed 
        //from all models which are not stopped at the moment
        else {
            let region = this.getMergedRegion();

            if (region && region.population > 0) {
                this.origin = vec3.fromValues(region.centre[0], region.centre[1], region.centre[2]);
                setDistance(region.bbox);
            }
            return true;
        }
    }

    public getMergedRegion(): Region {
        let region = new Region();
        const wcs = this.getCurrentWcs();
        this.activeHandles
            .forEach((h) => {
                const r = h.getRegion(wcs);
                if (r != null) {
                    region = region.merge(h.getRegion(wcs));
                }
            });

        return region;
    }

    // private getBiggestRegion(): Region {
    //     let volume = (box: Float32Array) => {
    //         return box[3] * box[4] * box[5];
    //     }
    //     const wcs = this.getCurrentWcs();

    //     let handle = this._handles
    //         .filter((h) => h != null && !h.stopped && h.getRegion(wcs) != null)
    //         .sort((a, b) => {
    //             let volA = volume(a.getRegion(wcs).bbox);
    //             let volB = volume(b.getRegion(wcs).bbox);
    //             if (volA < volB) {
    //                 return -1;
    //             }
    //             if (volA == volB) {
    //                 return 0;
    //             }
    //             if (volA > volB) {
    //                 return 1;
    //             }
    //         })
    //         .pop();
    //     if (handle)
    //         return handle.getRegion(wcs);
    //     else
    //         return null;
    // }

    /**
    * This method can be used for batch setting of viewer members. It doesn't check validity of the input.
    * @function Viewer#set
    * @param {Object} settings - Object containing key - value pairs
    */
    public set(settings: object): void {
        Object.getOwnPropertyNames(settings).forEach(key => {
            this[key] = settings[key];
        });
    };

    /**
    * This method uses WebWorker if available to load the model into this viewer.
    * Model has to be either URL to wexBIM file or Blob or File representing wexBIM file binary data. Any other type of argument will throw an exception.
    * You can load more than one model if they occupy the same space, use the same scale and have unique product IDs. Duplicated IDs won't affect 
    * visualization itself but would cause unexpected user interaction (picking, zooming, ...).
    * @function Viewer#load
    * @param {String | Blob | File} model - Model has to be either URL to wexBIM file or Blob or File representing wexBIM file binary data.
    * @param {Any} tag [optional] - Tag to be used to identify the model in {@link Viewer#event:loaded loaded} event.
    * @param {Object} headers [optional] - Headers to be used for request. This can be used for authorized access for example.
    * @fires Viewer#loaded
    */
    public loadAsync(model: string | Blob | File, tag?: any, headers?: { [name: string]: string }, progress?: (message: Message) => void): void {
        if (typeof (model) == 'undefined') {
            throw new Error('You have to specify model to load.');
        }
        if (typeof (model) != 'string' && !(model instanceof Blob)) {
            throw new Error('Model has to be specified either as a URL to wexBIM file or Blob object representing the wexBIM file.');
        }
        const self = this;
        const progressProxy = progress ? (m: Message) => {
            if (m.type === MessageType.COMPLETED) {
                // change all completer to progress so there is only one completed event in the end.
                m.type = MessageType.PROGRESS;
            }
            progress(m);
        } : (m: Message) => { };

        //fall back to synchronous loading if worker is not available
        if (typeof (Worker) === 'undefined') {
            this.load(model, tag, headers, progress);
        }

        const blob = new Blob([LoaderWorker], { type: 'application/javascript' })
        const worker = new Worker(URL.createObjectURL(blob));
        worker.onmessage = (evt) => {
            const msg = evt.data as Message;

            if (msg.type === MessageType.COMPLETED) {
                var geometry = msg.result as ModelGeometry;

                // remove result from message before we pass it out
                msg.result = null;
                progressProxy(msg);

                // add handle and report progress of GPU feeding
                const wexBimId = self.addHandle(geometry, tag, progressProxy);
                // report completed
                if (progress) {
                    progress({
                        message: 'Model loaded',
                        type: MessageType.COMPLETED,
                        percent: 100,
                        wexbimId: wexBimId
                    });
                }
            }
            else {
                // pass the message from worker out
                progressProxy(msg);
            }
        }
        worker.onerror = (e) => {
            self.error(e.message);
        };

        // make sure it is an absolute path
        // make it absolute path for the case when used in an inline Webworker
        if (typeof (model) === 'string' && model.indexOf('http') !== 0) {
            const a = document.createElement('a');
            a.href = model;
            model = a.href;
        }
        worker.postMessage({ model: model, headers: headers });
        return;
    }

    /**
    * This method is used to load model data into viewer. Model has to be either URL to wexBIM file or Blob or File representing wexBIM file binary data. Any other type of argument will throw an exception.
    * Region extend is determined based on the region of the model
    * Default view if 'front'. If you want to define different view you have to set it up in handler of {@link Viewer#event:loaded loaded} event. <br>
    * You can load more than one model if they occupy the same space, use the same scale and have unique product IDs. Duplicated IDs won't affect 
    * visualization itself but would cause unexpected user interaction (picking, zooming, ...)
    * @function Viewer#load
    * @param {String | Blob | File} model - Model has to be either URL to wexBIM file or Blob or File representing wexBIM file binary data.
    * @param {Any} tag [optional] - Tag to be used to identify the model in {@link Viewer#event:loaded loaded} event.
    * @param {Object} headers [optional] - Headers to be used for request. This can be used for authorized access for example.
    * @param {Function} progress [optional] - Progress reporting delegate
    * @fires Viewer#loaded
    */
    public load(model: string | Blob | File, tag?: any, headers?: { [name: string]: string }, progress?: (message: Message) => void) {
        if (model == null) {
            throw new Error('You have to specify model to load.');
        }
        if (typeof (model) != 'string' && !(model instanceof Blob)) {
            throw new Error('Model has to be specified either as a URL to wexBIM file or Blob object representing the wexBIM file.');
        }
        var viewer = this;

        var geometry = new ModelGeometry();
        geometry.onloaded = () => {
            viewer.addHandle(geometry, tag, progress);
        };
        geometry.onerror = (msg) => {
            viewer.error(msg);
        }
        geometry.load(model, headers, progress);
    }

    //this is a private function used to add loaded geometry as a new handle and to set up camera and 
    //default view if this is the first geometry loaded
    private addHandle(geometry: ModelGeometry, tag: any, progress: (message: Message) => void): number {
        var gl = this.setActive();
        var handle = new ModelHandle(gl, geometry, progress);

        //assign handle used to identify the model
        handle.tag = tag;
        this._handles.push(handle);

        //set perspective camera near and far based on 1 meter dimension and size of the model
        this.setCameraFromCurrentModels();

        //only set camera parameters and the view if this is the first model
        if (this.activeHandles.length === 1) {

            //set centre and default distance based on the most populated region in the model
            this.setCameraTarget();

            //set default view
            this.show(ViewType.DEFAULT, false);
        }

        // force redraw so when 'loaded' is called listeners can operate with current canvas.
        this.changed = true;

        /**
         * Occurs when geometry model is loaded into the viewer. This event returns object containing ID of the model.
         * This ID can later be used to unload or temporarily stop the model.
         * 
         * @event Viewer#loaded
         * @type {object}
         * @param {Number} id - model ID assigned by the viewer
         * @param {Any} tag - tag which was passed to 'Viewer.load()' function
         * 
        */
        this.fire('loaded', { model: handle.id, tag: tag });

        return handle.id;
    };

    /**
     * Sets camera parameters (near and far clipping planes) from current active models.
     * This should be called whenever active models are very different (size, units)
     */
    public setCameraFromCurrentModels() {
        if (this.activeHandles.length === 0) {
            return;
        }

        const region = this.getMergedRegion();
        if (!region || !region.bbox || region.bbox.length === 0) {
            return;
        }

        const meter = this.activeHandles[0].meter;
        var maxSize = Math.max(region.bbox[3], region.bbox[4], region.bbox[5]);
        this.perspectiveCamera.far = maxSize * 50;
        this.perspectiveCamera.near = meter / 10.0;

        //set orthogonalCamera boundaries so that it makes a sense
        this.orthogonalCamera.far = this.perspectiveCamera.far;
        this.orthogonalCamera.near = this.perspectiveCamera.near;
        var ratio = 1.8;
        this.orthogonalCamera.top = maxSize / ratio;
        this.orthogonalCamera.bottom = -this.orthogonalCamera.top;
        this.orthogonalCamera.right = maxSize / ratio * this.width / this.height;
        this.orthogonalCamera.left = -this.orthogonalCamera.right;

    }

    /**
     * Unloads model from the GPU. This action is not reversible.
     * 
     * @param {Number} modelId - ID of the model which you can get from {@link Viewer#event:loaded loaded} event.
     */
    public unload(modelId: number) {
        var handle = this.getHandle(modelId);
        if (handle == null) {
            throw new Error('Model with id: ' + modelId + " doesn't exist or was unloaded already.");
        }

        //stop for start so it doesn't interfere with the rendering loop
        handle.stopped = true;

        //remove from the array
        var index = this._handles.indexOf(handle);
        this._handles.splice(index, 1);
        this.changed = true;

        //unload and delete
        handle.unload();

        /**
         * Occurs when model is unloaded.
         *
         * @event Viewer#unloaded
         * @type {object}
         * @param {any} tag - Tag passed to the viewer when model was loaded
         * @param {Number} model - Model ID
         */
        this.fire('unloaded', { tag: handle.tag, model: handle.id })
    }

    //this function should be only called once during initialization
    //or when shader set-up changes
    public _initShaders(): boolean {
        const gl = this.gl;
        const compile = (shader: WebGLShader, code: string): boolean => {
            gl.shaderSource(shader, code);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                const err = gl.getShaderInfoLog(shader);
                this.error(err);
                console.error(err);
                return false;
            }
            return true;
        }

        //fragment shader
        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        let fsCompiled = false;
        if (this.glVersion === 1) {
            fsCompiled = compile(fragmentShader, fragment_shader);
        } else {
            fsCompiled = compile(fragmentShader, fragment_shader_300);
        }
        if (!fsCompiled) {
            return false;
        }

        //vertex shader (the more complicated one)
        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        let vsCompiled = false;
        if (this.glVersion === 1) {
            vsCompiled = compile(vertexShader, vertex_shader);
        } else {
            vsCompiled = compile(vertexShader, vertex_shader_300);
        }
        if (!vsCompiled) {
            return false;
        }

        //link program
        this._shaderProgram = gl.createProgram();
        gl.attachShader(this._shaderProgram, vertexShader);
        gl.attachShader(this._shaderProgram, fragmentShader);
        gl.linkProgram(this._shaderProgram);

        if (gl.getProgramParameter(this._shaderProgram, gl.LINK_STATUS)) {
            gl.useProgram(this._shaderProgram);
        } else {
            this.error('Could not initialise shaders ');
            console.error('Could not initialise shaders ');
        }
    }

    private setActive(): WebGLRenderingContext {
        var gl = this.gl;

        //set own shader in case other shader program was used before
        gl.useProgram(this._shaderProgram);

        return gl;
    }

    private _initAttributesAndUniforms(): void {
        var gl = this.setActive();;

        //create pointers to uniform variables for transformations
        this._pMatrixUniformPointer = gl.getUniformLocation(this._shaderProgram, 'uPMatrix');
        this._mvMatrixUniformPointer = gl.getUniformLocation(this._shaderProgram, 'uMVMatrix');
        this._lightUniformPointer = gl.getUniformLocation(this._shaderProgram, 'uLight');
        this._colorCodingUniformPointer = gl.getUniformLocation(this._shaderProgram, 'uColorCoding');
        this._renderingModeUniformPointer = gl.getUniformLocation(this._shaderProgram, 'uRenderingMode');
        this._highlightingColourUniformPointer = gl.getUniformLocation(this._shaderProgram, 'uHighlightColour');
        this._stateStyleSamplerUniform = gl.getUniformLocation(this._shaderProgram, 'uStateStyleSampler');

        this._pointers = new ModelPointers(gl, this._shaderProgram);


    }

    private _disableContextMenu() {
        // bind to canvas events
        this.canvas.addEventListener('contextmenu', event => {
            event.preventDefault();
            return event.type !== 'contextmenu';
        });
    }

    private get meter(): number {
        const handle = this._handles.find(h => !h.stopped);
        if (!handle) {
            return 1.0;
        }

        return handle.meter;
    }

    public navigate(type: NavigationMode, deltaX, deltaY) {
        if (!this._handles || !this._handles[0]) return;
        //translation in WCS is position from [0, 0, 0]
        var origin = vec3.copy(vec3.create(), this.origin);
        var camera = this.getCameraPosition();

        if (type === 'look-around') {
            origin = camera;
            deltaX = -deltaX;
            deltaY = -deltaY;
        }

        // look-at and look-around are inverted
        if (type === 'look-at') {
            origin = camera;
        }

        //get origin coordinates in view space
        var mvOrigin = vec3.transformMat4(vec3.create(), origin, this.mvMatrix);

        //movement factor needs to be dependant on the distance but one meter is a minimum so that movement wouldn't stop when camera is in 0 distance from navigation origin
        var distanceVec = vec3.subtract(vec3.create(), origin, camera);
        var distance = Math.max(vec3.length(distanceVec), this.meter);

        // Walking is at constant pace
        if (type === 'walk') {
            distance = this.meter * 0.5;
        }

        //move to the navigation origin in view space
        var transform = mat4.translate(mat4.create(), mat4.create(), mvOrigin);

        //function for conversion from degrees to radians
        const degToRad = (deg) => {
            return deg * Math.PI / 180.0;
        };

        switch (type) {
            case 'free-orbit':
                transform = mat4.rotate(mat4.create(), transform, degToRad(deltaY / 4), [1, 0, 0]);
                transform = mat4.rotate(mat4.create(), transform, degToRad(deltaX / 4), [0, 1, 0]);
                break;

            case 'fixed-orbit':
            case 'look-around':
            case 'look-at':
            case 'orbit':
                mat4.rotate(transform, transform, degToRad(deltaY / 4), [1, 0, 0]);

                //z rotation around model z axis
                var mvZ = vec3.transformMat3(vec3.create(),
                    [0, 0, 1],
                    mat3.fromMat4(mat3.create(), this.mvMatrix));
                mvZ = vec3.normalize(vec3.create(), mvZ);
                transform = mat4.rotate(mat4.create(), transform, degToRad(deltaX / 4), mvZ);
                break;

            case 'pan':
                mat4.translate(transform, transform, [deltaX * distance / 150, 0, 0]);
                mat4.translate(transform, transform, [0, (-1.0 * deltaY) * distance / 150, 0]);
                break;

            case 'walk':
            case 'zoom':
                mat4.translate(transform, transform, [0, 0, deltaX * distance / 20]);
                mat4.translate(transform, transform, [0, 0, deltaY * distance / 20]);
                break;

            default:
                break;
        }

        //reverse the translation in view space and leave only navigation changes
        var translation = vec3.negate(vec3.create(), mvOrigin);
        transform = mat4.translate(mat4.create(), transform, translation);

        //apply transformation in right order
        this.mvMatrix = mat4.multiply(mat4.create(), transform, this.mvMatrix);
    }

    private getCurrentWcs(): vec3 {
        let wcs: vec3 = vec3.create();
        let nonEmpty = this._handles.filter(h => !h.empty);
        if (nonEmpty.length > 0) {
            wcs = nonEmpty[0].wcs;
        }
        return wcs;
    }
    /**
    * This is a static draw method. You can use it if you just want to render model once with no navigation and interaction.
    * If you want interactive model call {@link Viewer#start start()} method. {@link Viewer#frame Frame event} is fired when draw call is finished.
    * @function Viewer#draw
    * @fires Viewer#frame
    */
    public draw(framebuffer?: Framebuffer) {

        let wcs = this.getCurrentWcs();
        let gl = this.gl;

        // clear previous data in buffers
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        let width = framebuffer ? framebuffer.width : this.width;
        let height = framebuffer ? framebuffer.height : this.height;

        // set right size of viewport
        gl.viewport(0, 0, width, height);
        this.updatePMatrix(width, height);

        // set blending function
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        //call all before-draw plugins
        this._plugins.forEach((plugin) => {
            if (!plugin.onBeforeDraw) {
                return;
            }
            plugin.onBeforeDraw(width, height);
        });

        gl = this.setActive();


        // set styling texture
        gl.activeTexture(gl.TEXTURE4);
        gl.bindTexture(gl.TEXTURE_2D, this._stateStyleTexture);
        gl.uniform1i(this._stateStyleSamplerUniform, 4);


        // set background colour
        gl.clearColor(this.background[0] / 255,
            this.background[1] / 255,
            this.background[2] / 255,
            this.background[3] / 255);



        //set uniforms (these may quickly change between calls to draw)
        gl.uniformMatrix4fv(this._pMatrixUniformPointer, false, this.pMatrix);
        gl.uniformMatrix4fv(this._mvMatrixUniformPointer, false, this.mvMatrix);

        // set light source as a head light
        var camera = this.getCameraPosition();
        gl.uniform3fv(this._lightUniformPointer, camera);

        //use normal colour representation (1 would cause shader to use colour coding of IDs)
        gl.uniform1i(this._colorCodingUniformPointer, ColourCoding.NONE);

        //update highlighting colour
        gl.uniform4fv(this._highlightingColourUniformPointer,
            new Float32Array(
                [
                    this.highlightingColour[0] / 255.0,
                    this.highlightingColour[1] / 255.0,
                    this.highlightingColour[2] / 255.0,
                    this.highlightingColour[3] / 255.0
                ]));

        // bind buffer if defined
        if (framebuffer) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer.framebuffer);
        } else {
            //set framebuffer to render into canvas (in case it was set for rendering to different framebuffer)
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }

        gl.uniform1i(this._renderingModeUniformPointer, this.renderingMode);
        // check for x-ray mode. XRAY mode uses 2 phase rendering to
        // sort out all transparency issues so that all selected objects are
        // properly visible
        if (this.renderingMode === RenderingMode.XRAY || this.renderingMode === RenderingMode.XRAY_ULTRA) {
            this.drawXRAY(gl);
        } else {
            gl.disable(gl.CULL_FACE);
            gl.enable(gl.DEPTH_TEST);

            //two runs, first for solids from all models, second for transparent objects from all models
            //this makes sure that transparent objects are always rendered at the end.
            this._handles.forEach((handle) => {
                if (!handle.stopped) {
                    handle.setActive(this._pointers, wcs);
                    handle.draw(DrawMode.SOLID);
                }
            });

            this._handles.forEach((handle) => {
                if (!handle.stopped) {
                    handle.setActive(this._pointers, wcs);
                    handle.draw(DrawMode.TRANSPARENT);
                }
            });
        }

        //call all after-draw plugins
        this._plugins.forEach((plugin) => {
            if (!plugin.onAfterDraw) {
                return;
            }
            plugin.onAfterDraw(width, height);
        });
    };

    private drawXRAY(gl: WebGLRenderingContext) {
        const mode = this.renderingMode;
        const wcs = this.getCurrentWcs();

        const transparentPass = () => {
            gl.enable(gl.CULL_FACE);
            // the rest as semitransparent overlay
            gl.uniform1i(this._renderingModeUniformPointer, 3);
            // disable writing to depth buffer. This will respect depth buffer
            // from first pass but will render everything from this pass as
            // semitransparent without depth testing
            gl.depthMask(false);
            this._handles.forEach((handle) => {
                if (!handle.stopped) {
                    handle.setActive(this._pointers, wcs);
                    handle.draw();
                }
            });
            gl.depthMask(true);
        };

        const highlightedPass = () => {
            gl.disable(gl.CULL_FACE);
            // only highlighted and x-ray visible
            gl.uniform1i(this._renderingModeUniformPointer, RenderingMode.XRAY);
            gl.enable(gl.DEPTH_TEST);
            this._handles.forEach((handle) => {
                if (!handle.stopped) {
                    handle.setActive(this._pointers, wcs);
                    handle.draw();
                }
            });
        };

        // transparent objects are drawn on top of highlighted
        // content but it never hides it. Transparent layer
        // doesn't write into depth buffer but only uses highlighted
        // elements depth buffer so it doesn't hide anything but makes
        // colour overlay on top of highlighted elements which may make them less 
        // visible
        if (mode === RenderingMode.XRAY) {
            highlightedPass();
            transparentPass();
        }

        // this will make highlighted elements overriding
        // all transparent objects to it will be always clearly
        // visible. But it might not look right.
        if (mode === RenderingMode.XRAY_ULTRA) {
            transparentPass();
            highlightedPass();
        }
    }

    private updatePMatrix(width: number, height: number) {
        //set up cameras
        switch (this.camera) {
            case CameraType.PERSPECTIVE:
                mat4.perspective(this.pMatrix,
                    this.perspectiveCamera.fov * Math.PI / 180.0,
                    width / height,
                    this.perspectiveCamera.near,
                    this.perspectiveCamera.far);
                break;

            case CameraType.ORTHOGONAL:
                mat4.ortho(this.pMatrix,
                    this.orthogonalCamera.left,
                    this.orthogonalCamera.right,
                    this.orthogonalCamera.bottom,
                    this.orthogonalCamera.top,
                    this.orthogonalCamera.near,
                    this.orthogonalCamera.far);
                break;

            default:
                mat4.perspective(this.pMatrix,
                    this.perspectiveCamera.fov * Math.PI / 180.0,
                    width / height,
                    this.perspectiveCamera.near,
                    this.perspectiveCamera.far);
                break;
        }
    }

    /**
    * Use this method to get actual camera position.
    * @function Viewer#getCameraPosition
    */
    public getCameraPosition(): vec3 {
        const transform = mat4.multiply(mat4.create(), this.pMatrix, this.mvMatrix);
        const inv = mat4.invert(mat4.create(), transform);
        if (inv == null) {
            return vec3.create();
        }
        const eye = vec3.transformMat4(vec3.create(), vec3.create(), inv);

        return eye;
    }

    /**
     * Use this method to get camera direction
    * @function Viewer#getCameraDirection
     */
    public getCameraDirection(): vec3 {
        const inv = mat4.invert(mat4.create(), this.mvMatrix);
        const rotation = mat4.getRotation(quat.create(), inv);

        return vec3.transformQuat(vec3.create(), vec3.fromValues(0,0,-1), rotation);
    }

    /**
    * Use this method to zoom to specified element. If you don't specify a product ID it will zoom to full extent.
    * @function Viewer#zoomTo
    * @param {Number} [id] Product ID
    * @param {Number} [model] Model ID
    * @return {Bool} True if target exists and zoom was successful, False otherwise
    */
    public zoomTo(id?: number, model?: number): Promise<void> {
        var found = this.setCameraTarget(id, model);
        if (!found) 
            return new Promise<void>((a, r) => r());

        var eye = this.getCameraPosition();
        var dir = vec3.create();
        vec3.subtract(dir, eye, this.origin);
        dir = vec3.normalize(vec3.create(), dir);

        var translation = vec3.create();
        vec3.scale(translation, dir, this.distance * 1.2);
        vec3.add(eye, translation, this.origin);

        var mv = mat4.lookAt(mat4.create(), eye, this.origin, [0, 0, 1]);
        return this.animations.viewTo(mv, this.zoomDuration);
    }

    /**
    * Use this function to show default views.
    *
    * @function Viewer#show
    * @param {String} type - Type of view. Allowed values are <strong>'top', 'bottom', 'front', 'back', 'left', 'right'</strong>. 
    * Directions of this views are defined by the coordinate system. Target and distance are defined by {@link Viewer#setCameraTarget setCameraTarget()} method to certain product ID
    * or to the model extent if {@link Viewer#setCameraTarget setCameraTarget()} is called with no arguments.
    */
    public show(type: ViewType, withAnimation = true): Promise<void> {
        let duration = withAnimation? this.zoomDuration : 0;
        let origin = this.origin;
        let distance = this.distance;
        let camera = [0, 0, 0];
        let heading = [0, 0, 1];
        switch (type) {
            //top and bottom are different because these are singular points for look-at function if heading is [0,0,1]
            case ViewType.TOP:
                //only move to origin and up (negative values because we move camera against model)
                const mvTop = mat4.translate(mat4.create(),
                    mat4.create(),
                    [origin[0] * -1.0, origin[1] * -1.0, (distance + origin[2]) * -1.0]);
                return this.animations.viewTo(mvTop, duration);
            case ViewType.BOTTOM:
                //only move to origin and up and rotate 180 degrees around Y axis
                var toOrigin = mat4.translate(mat4.create(),
                    mat4.create(),
                    [origin[0] * -1.0, origin[1] * +1.0, (origin[2] + distance) * -1]);
                var rotationY = mat4.rotateY(mat4.create(), toOrigin, Math.PI);
                var rotationZ = mat4.rotateZ(mat4.create(), rotationY, Math.PI);
                const mvBottom = rotationZ;

                return this.animations.viewTo(mvBottom, duration);
            case ViewType.FRONT:
                camera = [origin[0], origin[1] - distance, origin[2]];
                break;
            case ViewType.BACK:
                camera = [origin[0], origin[1] + distance, origin[2]];
                break;
            case ViewType.LEFT:
                camera = [origin[0] - distance, origin[1], origin[2]];
                break;
            case ViewType.RIGHT:
                camera = [origin[0] + distance, origin[1], origin[2]];
                break;
            case ViewType.DEFAULT:
                let a = Math.sqrt(distance * distance / 3);
                camera = [origin[0] - a, origin[1] - a, origin[2] + (a * 0.33)];
                break;
            default:
                break;
        }
        // use look-at function to set up camera and target
        const mv = mat4.lookAt(mat4.create(), camera, origin, heading);
        return this.animations.viewTo(mv, duration);
    }

    /**
     * Starts rotation around to present the model
     */
    public startRotation() {
        this.animations.startRotation();
    }
    /**
     * Stops rotation of the model
     */
    public stopRotation(): void {
        this.animations.stopRotation();
    }


    /**
     * 
     * @param msg Fires error event. This might be used by plugins.
     */
    public error(msg) {
        /**
        * Occurs when viewer encounters error. You should listen to this because it might also report asynchronous errors which you would miss otherwise.
        *
        * @event Viewer#error
        * @type {object}
        * @param {string} message - Error message
        */
        this.fire('error', { message: msg });
    }

    public getIdsFromEvent(event: MouseEvent | Touch): ProductIdentity {
        let x = event.clientX;
        let y = event.clientY;

        //get coordinates within canvas (with the right orientation)
        let r = this.canvas.getBoundingClientRect();
        let viewX = x - r.left;
        let viewY = this.height - (y - r.top);

        //get product id and model id
        return this.getID(viewX, viewY);
    }

    public getID(x: number, y: number): ProductIdentity {
        const renderId = this.getIdPart(x, y, false);
        if (renderId == null) {
            return { id: null, model: null };
        }
        const modelId = this.getIdPart(x, y, true);
        const handle = this.getHandle(modelId);

        // most possibly plugin object
        if (!handle) {
            var identity = { id: renderId, model: modelId };
            var handled = false;
            this._plugins.forEach((plugin) => {
                if (!plugin.onBeforeGetId) {
                    return;
                }
                handled = handled || plugin.onBeforeGetId(identity);
            });

            if (!handled)
                return identity;
            else
                return { id: null, model: null };
        }

        const productId = handle.getProductId(renderId);
        return { id: productId, model: modelId };
    }

    //this renders the colour coded model into the memory buffer
    //not to the canvas and use it to identify ID of the object from that
    private getIdPart(x: number, y: number, modelId: boolean = false): number {

        //skip all the GPU work if there is only one model loaded and model ID is requested
        if (modelId && this._handles.length === 1 && this._plugins.length === 0) {
            return this._handles[0].id;
        }

        //call all before-drawId plugins
        this._plugins.forEach((plugin) => {
            if (!plugin.onBeforeDrawId) {
                return;
            }
            plugin.onBeforeDrawId();
        });

        //it is not necessary to render the image in full resolution so this factor is used for less resolution. 
        var factor = 2;
        var gl = this.setActive();
        var width = this.width / factor;
        var height = this.height / factor;
        x = x / factor;
        y = y / factor;

        const fb = new Framebuffer(gl, width, height);
        //create framebuffer
        var frameBuffer = fb.framebuffer;

        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
        gl.viewport(0, 0, width, height);

        gl.enable(gl.DEPTH_TEST); //we don't use any kind of blending or transparency
        gl.disable(gl.BLEND);
        gl.clearColor(0, 0, 0, 0); //zero colour for no-values
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        //set uniform for colour coding
        gl.uniform1i(this._colorCodingUniformPointer, ColourCoding.PRODUCTS);

        const wcs = this.getCurrentWcs();

        //render colour coded image using latest buffered data
        this._handles.forEach((handle) => {
            if (!handle.stopped && handle.pickable) {
                if (modelId) {
                    gl.uniform1i(this._colorCodingUniformPointer, handle.id);
                }
                handle.setActive(this._pointers, wcs);
                handle.draw();
            }
        });

        //call all after-drawId plugins
        this._plugins.forEach((plugin) => {
            if (modelId) {
                if (!plugin.onAfterDrawModelId) {
                    return;
                }
                plugin.onAfterDrawModelId();
            } else {
                if (!plugin.onAfterDrawId) {
                    return;
                }
                plugin.onAfterDrawId();
            }
        });

        //get colour in of the pixel
        var result = new Uint8Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, result);


        //reset framebuffer to render into canvas again
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        //free GPU memory
        fb.delete();

        //set back blending
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.BLEND);

        //decode ID (bit shifting by multiplication)
        var hasValue = result[3] != 0; //0 transparency is only for no-values
        if (hasValue) {
            var id = result[0] + result[1] * 256 + result[2] * 256 * 256;
            return id;
        }

        return null;
    }

    /**
     * Stops all models and only shows a single product
     * @param {Number[]} productId Product IDs
     * @param {Number} modelId Model ID
     */
    public isolate(productIds: number[], modelId: number) {
        const handle = this.getHandle(modelId);
        if (!handle) {
            throw new Error(`Model with id ${modelId} doesn't exist.`);
        }
        handle.isolatedProducts = productIds;
    }

    /**
     * Gets list of isolated product IDs
     * @param modelId
     */
    public getIsolated(modelId: number): number[] {
        const handle = this.getHandle(modelId);
        if (!handle) {
            throw new Error(`Model with id ${modelId} doesn't exist.`);
        }
        return handle.isolatedProducts;
    }

    /**
     * Use this function to start animation of the model. If you start animation before geometry is loaded it will wait for content to render it.
     * This function is bound to browser framerate of the screen so it will stop consuming any resources if you switch to another tab.
     *
     * @function Viewer#start
     * @param {Number} modelId [optional] - Optional ID of the model to be stopped. You can get this ID from {@link Viewer#event:loaded loaded} event.
     * @param {Number} productId [optional] - Optional ID of the product. If specified, only this product will be presented.
     *                                        This is highly optimal because it doesn't even touch other data in the model
     */
    public start(modelId?: number) {
        if (modelId != null) {
            var handle = this.getHandle(modelId);
            if (typeof (handle) === 'undefined') {
                throw new Error("Model doesn't exist.");
            }

            handle.stopped = false;
            //set perspective camera near and far based on 1 meter dimension and size of the model
            this.setCameraFromCurrentModels();

            // if the viewer is running already we can return from here
            if (this._isRunning) {
                return;
            }
        }

        this.changed = true;
        //set perspective camera near and far based on 1 meter dimension and size of the model
        this.setCameraFromCurrentModels();

        if (this._isRunning) {
            return;
        }

        // unblock and start the rendering loop
        this._isRunning = true;

        // FPS counting infrastructure
        var lastTime = new Date();
        var counter = 0;

        const tick = () => {
            counter++;
            // compute and report FPS every 30 frames
            if (counter == 30) {
                counter = 0;
                var newTime = new Date();
                var span = newTime.getTime() - lastTime.getTime();
                lastTime = newTime;
                var fps = 1000 / span * 30;
                /**
                * Occurs after every 30th frame in animation. Use this event if you want 
                * to report FPS to the user. It might also be an interesting performance measure.
                *
                * @event Viewer#fps 
                * @type {Number}
                */
                this.fire('fps', Math.floor(fps));
            }

            if (!this._isRunning) {
                return;
            }

            if (this._handles.length !== 0 && (this.changed || this.activeHandles.filter(h => h.changed).length != 0)) {

                this.changed = false;
                this.draw();
            }
            this._requestAnimationFrame(tick);
        }

        tick();
    }

    /**
    * Use this function to stop animation of the model. User will still be able to see the latest state of the model. You can 
    * switch animation of the model on again by calling {@link Viewer#start start()}.
    *
    * @function Viewer#stop
    * @param {Number} id [optional] - Optional ID of the model to be stopped. You can get this ID from {@link Viewer#event:loaded loaded} event.
    */
    public stop(id?: number) {
        if (id == null) {
            this._isRunning = false;
            return;
        }

        var model = this.getHandle(id);
        if (model == null) {
            throw new Error("Model doesn't exist.");
        }

        model.stopped = true;
        this.changed = true;
        //set perspective camera near and far based on 1 meter dimension and size of the model
        this.setCameraFromCurrentModels();
    }

    /**
    * Use this function to stop all models. You can 
    * switch animation of the model on again by calling {@link Viewer#start start()}.
    *
    * @function Viewer#stopAll
    */
    public stopAll() {

        this._handles.forEach((model) => {
            model.stopped = true;
            this.changed = true;
        });

        // we can stop the loop when there isn't anything to draw
        this._isRunning = false;
    }

    /**
     * Checks if the model with defined ID is currently loaded and running
     *
     * @param {number} id - Model ID
     * @returns {boolean} True if model is loaded and running, false otherwise
     */
    public isModelOn(id: number): boolean {
        var model = this.getHandle(id);
        if (!model)
            return false;
        return !model.stopped;
    }

    /**
     * Checks if product with this ID exists in the model
     * @param productId
     * @param modelId
     */
    public isProductInModel(productId: number, modelId: number): boolean {
        var model = this.getHandle(modelId);
        if (!model) {
            return false;
        }
        return model.getState(productId) != null;
    }

    /**
     * Checks if the model with defined ID is currently loaded in the viewer.
     *
     * @param {number} id - Model ID
     * @returns {boolean} True if model is loaded, false otherwise
     */
    public isModelLoaded(id: number): boolean {
        var model = this.getHandle(id);
        if (!model)
            return false;
        return true;
    }


    /**
    * Use this function to start all models. You can 
    * switch animation of the model off by calling {@link Viewer#stop stop()}.
    *
    * @function Viewer#startAll
    */
    public startAll() {

        this._handles.forEach((model) => {
            model.stopped = false;
            this.changed = true;
        });
        // make sure the viewer is running
        this._isRunning = true;
    }

    /**
    * Use this function to stop picking of the objects in the specified model. It will behave as if not present for all picking operations.
    * All models are pickable by default when loaded.
    *
    * @function Viewer#stopPicking
    * @param {Number} id - ID of the model to be stopped. You can get this ID from {@link Viewer#event:loaded loaded} event.
    */
    public stopPicking(id: number) {
        var model = this.getHandle(id);
        if (model == null) {
            throw new Error("Model doesn't exist.");
        }

        model.pickable = false;
    }

    /**
    * Use this function to enable picking of the objects in the specified model. 
    * All models are pickable by default when loaded. You can stop the model from being pickable using {@link Viewer#stopPicking} function.
    *
    * @function Viewer#startPicking
    * @param {Number} id - ID of the model to be stopped. You can get this ID from {@link Viewer#event:loaded loaded} event.
    */
    public startPicking(id: number) {
        var model = this.getHandle(id);
        if (typeof (model) === 'undefined')
            throw "Model doesn't exist.";

        model.pickable = true;
    }

    /**
     * Returns true if model participates in picking, false otherwise
     * @param {number} modelId ID of the model
     */
    public isPickable(modelId: number) {
        var model = this.getHandle(modelId);
        return model.pickable;
    }

    /**
     * Use this method to register to events of the viewer like {@link Viewer#event:pick pick}, {@link Viewer#event:mouseDown mouseDown}, 
     * {@link Viewer#event:loaded loaded} and others. You can define arbitrary number
     * of event handlers for any event. You can remove handler by calling {@link Viewer#off off()} method.
     *
     * @function Viewer#on
     * @param {String} eventName - Name of the event you would like to listen to.
     * @param {Object} handler - Callback handler of the event which will consume arguments and perform any custom action.
    */
    public on<K extends keyof ViewerEventMap>(eventName: K, handler: (args: ViewerEventMap[K]) => void) {
        var events = this._events;
        if (!events[eventName]) {
            events[eventName] = [];
        }
        events[eventName].push(handler);

        const domEvtName = `on${eventName}`;
        const isCanvEvt = this.canvas[domEvtName] != null;
        if (!isCanvEvt) {
            return;
        }
        const hasListener = this._canvasListeners[eventName] != null
        if (hasListener) {
            return;
        }
        // bind to canvas events
        const listener = (event: Event) => {
            // only forward mouse and touch events where we can enrich the event
            // with product and model ID from the model
            if (event instanceof MouseEvent) {
                let ids = this.getIdsFromEvent(event as MouseEvent);
                this.fire(eventName, { event: event, id: ids.id, model: ids.model });
                return;
            }
            if (event instanceof TouchEvent) {
                // get ID from the last touch
                let ids = this.getIdsFromEvent(event.touches[event.touches.length - 1]);
                this.fire(eventName, { event: event, id: ids.id, model: ids.model });
                return;
            }
        };
        this.canvas.addEventListener(eventName, listener);
        // keep the reference to the listener so we can remove it when not needed any more
        this._canvasListeners[eventName] = listener;
    }

    /**
    * Use this method to unregister handlers from events. You can add event handlers by calling the {@link Viewer#on on()} method.
    *
    * @function Viewer#off
    * @param {String} eventName - Name of the event
    * @param {Object} callback - Handler to be removed
    */
    public off(eventName: string, callback) {
        var events = this._events;
        var callbacks = events[eventName];
        if (!callbacks) {
            return;
        }
        var index = callbacks.indexOf(callback);
        if (index >= 0) {
            callbacks.splice(index, 1);
            const listener = this._canvasListeners[eventName];
            // detach canvas listener if it is not needed anymore
            if (callback.length === 0 && listener != null) {
                this.canvas.removeEventListener(eventName, listener);
            }
        }
    }

    //executes all handlers bound to event name
    public fire<K extends keyof ViewerEventMap>(eventName: K, args: ViewerEventMap[K]) {
        var handlers = this._events[eventName];
        if (!handlers) {
            return;
        }
        //call the callbacks
        handlers.slice().forEach((handler) => {
            try {
                handler(args);
            }
            catch (e) {
                console.error(e);
            }
        });
    }

    public disableTextSelection() {
        //disable text selection
        document.documentElement.style['-webkit-touch-callout'] = 'none';
        document.documentElement.style['-webkit-user-select'] = 'none';
        document.documentElement.style['-khtml-user-select'] = 'none';
        document.documentElement.style['-moz-user-select'] = 'none';
        document.documentElement.style['-ms-user-select'] = 'none';
        document.documentElement.style['user-select'] = 'none';
    }

    public enableTextSelection() {
        //enable text selection again
        document.documentElement.style['-webkit-touch-callout'] = 'text';
        document.documentElement.style['-webkit-user-select'] = 'text';
        document.documentElement.style['-khtml-user-select'] = 'text';
        document.documentElement.style['-moz-user-select'] = 'text';
        document.documentElement.style['-ms-user-select'] = 'text';
        document.documentElement.style['user-select'] = 'text';
    }

    /**
   * Use this method to clip the model with A plane. Use {@link Viewer#unclip unclip()} method to 
   * unset clipping plane.
   *
   * @function Viewer#setClippingPlaneA
   * @param {Number[]} point - point in clipping plane
   * @param {Number[]} normal - normal pointing to the half space which will be hidden
   * @param {Number} [modelId] - Optional ID of the model to be clipped. All models are clipped otherwise.
   */
    public clip(point: number[], normal: number[]) {
        if (point == null || normal == null) {
            throw new Error('Cutting plane not well defined');
        }
        //compute normal equation of the plane
        var d = 0.0 - normal[0] * point[0] - normal[1] * point[1] - normal[2] * point[2];

        //set clipping plane A for all models
        this._handles.forEach((h) => {
            h.clippingPlaneA = [normal[0], normal[1], normal[2], d];
            h.clippingPlaneB = null;
        });
    }

    /**
   * Use this method to clip the model with A plane. Use {@link Viewer#unclip unclip()} method to 
   * unset clipping plane.
   *
   * @function Viewer#setClippingPlaneA
   * @param {Number[]} plane - normal equation of the plane
   * @param {Number} [modelId] - Optional ID of the model to be clipped. All models are clipped otherwise.
   */
    public setClippingPlaneA(plane: number[], modelId?: number) {

        if (modelId != null) {
            var handle = this.getHandle(modelId);
            if (handle) {
                handle.clippingPlaneA = plane;
            }
        } else {
            //set clipping plane for all models
            this._handles.forEach((h) => {
                h.clippingPlaneA = plane;
            });
        }
    }

    /**
   * Use this method to clip the model with A plane. Use {@link Viewer#unclip unclip()} method to 
   * unset clipping plane.
   *
   * @function Viewer#setClippingPlaneB
   * @param {Number[]} plane - normal equation of the plane
   * @param {Number} [modelId] - Optional ID of the model to be clipped. All models are clipped otherwise.
   */
    public setClippingPlaneB(plane: number[], modelId?: number) {

        if (modelId != null) {
            var handle = this.getHandle(modelId);
            if (handle) {
                handle.clippingPlaneB = plane;
            }
        } else {
            //set clipping plane for all models
            this._handles.forEach((h) => {
                h.clippingPlaneB = plane;
            });
        }
    }

    /**
    * This method will cancel any clipping plane if it is defined. Use {@link Viewer#clip clip()} 
    * method to define clipping by point and normal of the plane.
    * @function Viewer#unclip
    * @param {Number} [modelId] - Optional ID of the model to be unclipped. All models are unclipped otherwise.
    */
    public unclip(modelId?: number): void {
        if (modelId != null) {
            var handle = this.getHandle(modelId);
            if (handle) {
                handle.clippingPlaneA = null;
                handle.clippingPlaneB = null;
            }
        } else {
            this._handles.forEach((h) => {
                h.clippingPlaneA = null;
                h.clippingPlaneB = null;
            });
        }
    }

    public getClip(modelId: number): { PlaneA: number[], PlaneB: number[] } {
        var handle = this.getHandle(modelId);
        if (handle) {
            return {
                PlaneA: handle.clippingPlaneA,
                PlaneB: handle.clippingPlaneB
            }
        }
        return null;
    }
}

enum ColourCoding {
    NONE = -1,
    PRODUCTS = -2
}

export enum RenderingMode {
    NORMAL = 0,
    GRAYSCALE = 1,
    XRAY = 2,
    // _XRAY2 = 3, // used internally in the shader
    XRAY_ULTRA = 4,
}

export enum ViewType {
    TOP,
    BOTTOM,
    FRONT,
    BACK,
    LEFT,
    RIGHT,
    DEFAULT
}

export enum CameraType {
    PERSPECTIVE = 0,
    ORTHOGONAL = 1
}
