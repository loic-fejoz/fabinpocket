;
(function($) {
    "use strict";

    const TIMER_NB_FRAMES = 16;
    function FPSTimer() {
	this.timeTable = [];
	this.currentTimeTableIndex = 0;
	this.totalTime = TIMER_NB_FRAMES;
	for(var i = 0; i < TIMER_NB_FRAMES; i++) {
	    this.timeTable[i] = 1.0;
	}
	this.averageFPS = 0;
    }

    /**
     * @param {number} elapsed time in milliseconds since last frame.
     */
    FPSTimer.prototype.update = function(elapsedTime) {
	elapsedTime = elapsedTime * 0.001; // Convert to seconds
	this.totalTime = this.totalTime + elapsedTime - this.timeTable[this.currentTimeTableIndex];
	this.timeTable[this.currentTimeTableIndex] = elapsedTime;
	this.currentTimeTableIndex = (this.currentTimeTableIndex + 1) % TIMER_NB_FRAMES;
	this.averageFPS = Math.floor((1.0 / (this.totalTime / TIMER_NB_FRAMES)) + 0.5);
    }
    var fpsTimer = new FPSTimer();
    
    var FabInPocket = {zScale: 1.0};
    document.FabInPocket = FabInPocket;
    var glcanvas = FabInPocket.glcanvas = document.getElementById('previewcanvas');
    
    var shaderProgram;
    var vertexPositionAttribute;

    /**
     * Load scripts from HTML and compile them as shader program.
     */
    function initShaders() {
	shaderProgram = tdl.programs.loadProgram(
	    document.getElementById("shader-vs").textContent,
	    document.getElementById("shader-fs").textContent).program;
	
	gl.useProgram(shaderProgram);
	
	vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition_modelspace");
	gl.enableVertexAttribArray(vertexPositionAttribute);
    }

    /**
     * Push coordinates of point into vertices.
     * @param {Object} point to push
     * @param {Number[]} vertices to push to.
     */
    function outputPoint(vertices, point) {
	vertices.push(point.x);
	vertices.push(point.y);
	vertices.push(point.z);
	//console.log(point);
    }

    /**
     * If above level, push two triangles to vertices,
     * ie one for the bottom face and one for up face.
     * @param {Object[3]} points to push
     * @param {Number[]} vertices to push to
     */
    function outputTriangle(vertices, points) {
	// assert(points.length == 3);
	if (points[0].z > 0 || points[1].z > 0 || points[2].z > 0) {
	    
	    outputPoint(vertices, points[0]);
	    outputPoint(vertices, points[1]);
	    outputPoint(vertices, points[2]);
	    
	    outputPoint(vertices, {x: points[0].x, y: points[0].y, z: 0.0});
	    outputPoint(vertices, {x: points[2].x, y: points[2].y, z: 0.0});
	    outputPoint(vertices, {x: points[1].x, y: points[1].y, z: 0.0});
	}
    }

    /**
     * Push two triangles given 4 points
     * @param {Object[4]} points to build triangles from
     * @param {Number[]} vertices to push to
     */
    function outputQuad(vertices, points) {
	// assert(points.length == 4);
	outputTriangle(vertices, [points[0], points[3], points[1]]);
	outputTriangle(vertices, [points[0], points[2], points[3]]);
    }
    
    var heightmapCanvas = document.getElementById("shapecanvas");
    var zMax = undefined;
    var imgTag = document.getElementById("heightmap");

    /*========================== Distance computation ========================================*/

    
    function sweepTopToBottom(data, img) {
	for(var x=0; x < (img.width-1); x++) {
	    for(var y=0; y < (img.height-1); y++) {
		var i_xy = x + (y * img.width);
		var z_xy = data[i_xy];
		var i_xy1 = x + ((y+1) * img.width);
		var z_xy1 = data[i_xy1];
		data[i_xy1] = Math.min(z_xy + 1, z_xy1);
	    }
	}
    }
    
    function sweepBottomToTop(data, img) {
	for(var x=0; x < (img.width-1); x++) {
	    for(var y= img.height-1; y >= 0; y--) {
		var i_xy = x + (y * img.width);
		var z_xy = data[i_xy];
		var i_xym1 = x + ((y-1) * img.width);
		var z_xym1 = data[i_xym1];
		data[i_xym1] = Math.min(z_xy + 1, z_xym1);
	    }
	}
    }
    
    function sweepLeftToRight(data, img) {
	for(var y=0; y < (img.height-1); y++) {
	    for(var x=0; x < (img.width-1); x++) {
		var i_xy = x + (y * img.width);
		var z_xy = data[i_xy];
		var i_x1y = x + 1 + (y * img.width);
		var z_x1y = data[i_x1y];
		data[i_x1y] = Math.min(z_xy + 1, z_x1y);
	    }
	}
    }
    
    function sweepRightToLeft(data, img) {
	for(var y=0; y < (img.height-1); y++) {
	    for(var x=(img.width-1); x >= 0; x--) {
		var i_xy = x + (y * img.width);
		var z_xy = data[i_xy];
		var i_xm1y = x - 1 + (y * img.width);
		var z_xm1y = data[i_xm1y];
		data[i_xm1y] = Math.min(z_xy + 1, z_xm1y);
	    }
	}
    }

    /**
     * Compute an approximate distance.
     * See A GENERAL ALGORITHM FOR COMPUTING DISTANCE TRANSFORMS IN LINEAR TIME,
     * by A. MEIJSTER‚ J.B.T.M. ROERDINK and W.H. HESSELINK
     */
    function sweep(data, img) {
	sweepTopToBottom(data, img);
	sweepBottomToTop(data, img);
	sweepLeftToRight(data, img);
	sweepRightToLeft(data, img);
    }

    /*========================== Image to 3D ========================================*/
    
    /**
     * Return true if the point at given coordinate is a local maximum.
     */
    function isOnSkeleton(original, src, img, x, y) {
	var countHigherThanMe = 0;
	var i_xy = x + (y * img.width);
	var z_xy = src[i_xy];
	if (original[i_xy] === 0) {
	    return false;
	}
	for(var dx=-1; dx <= 1; dx++) {
	    for(var dy=-1; dy <= 1; dy++) {
		if (dx === 0 && dy === 0) {
		    continue;
		}
		var index = (x + dx) + ((y + dy) * img.width);
		var z_index = src[index];
		if (z_index > z_xy) {
		    countHigherThanMe += 1;
		}
	    }
	}
	return (countHigherThanMe < 1);
    }
    
    /**
     * Mark tops of the hills as zero.
     */
    function initSkeleton(original, src, img, output) {
	var dMax = Math.max(img.width, img.height);
	var i = output.length;
	while(i--) {
	    output[i] = dMax;
	}
	for(var y=1; y < (img.height-2); y++) {
	    for(var x=1; x < (img.width-2); x++) {
		var i_xy = x + (y * img.width);
		// Is z_xy on the skeleton?
		if (isOnSkeleton(original, src, img, x, y)) {
		    output[i_xy] = 0;
		}
	    }
	}
    }

    /**
     * Compute the implicit heightmap into #computedheightmapcanvas
     * from the given array of heights.
     */
    function loadImageToComputedheightmapcanvas(heights, img, zScale) {
	var canvas = document.getElementById("computedheightmapcanvas");
	canvas.width = img.width;
	canvas.height = img.height;
	var img = new Image();
	img.src = imgTag.src;
	var ctx = canvas.getContext('2d');
	var modifiedHeights = new Array(heights.length);
	// First initialize with maximum distance when inside
	var zCut = 0.1;
	var i = heights.length;
	while(i--) {
	    modifiedHeights[i] = (heights[i] > zCut)  ? Math.max(img.width, img.height) : 0;
	}
	// Then compute distance from edges
	sweep(modifiedHeights, img);
	
	var skeleton = new Array(heights.length);
	// Then Init local top, ie skeleton
	initSkeleton(heights, modifiedHeights, img, skeleton);
	
	// Then compute distance from skeleton
	sweep(skeleton, img);
	
	// Convert distance to imgData
	var longestDistance = 0;
	var imgData = ctx.getImageData(0, 0, img.width, img.height);
        var data = imgData.data;
	i = heights.length;
	while(i--) {
	    var d = modifiedHeights[i];
	    /* let find the height d of the point which is on the circle of radius (modifiedHeights+skeleton)
	     * and whose hauteur is at ratio m / s
	     */
	    d = Math.sqrt((modifiedHeights[i] + skeleton[i]) * (modifiedHeights[i] + skeleton[i]) - (skeleton[i] * skeleton[i]));
	    if (d > longestDistance) {
		longestDistance = d;
		// console.log("longer distance found: " + d + ", " + heights[i] + ", " + (zScale * heights[i] * d));
	    }
	    /* then scale with initial given heightmap and zScale */
	    d = zScale * heights[i] / 255.0 * d;
	    data[4*i] = d;
	    data[(4*i) + 1] = (skeleton[i] === 0 && heights[i] !== 0) ? 255 : d;
	    data[(4*i) + 2] = (skeleton[i] === 0 && heights[i] !== 0) ? 0 : d;
	    // data[(4*i) + 1] = d;
	    // data[(4*i) + 2] = d;
	    data[(4*i) + 3] = 255;
	}
	console.log("longest distance found: " + longestDistance);
	// Finally display imgData
	ctx.putImageData(imgData, 0, 0);
    }

    /**
     * Convert the image #heightmap to an array of heights.
     * @return {numbers[img.width * img.height]} array of heights
     */
    function loadHeights(heightmapCanvas, img) {
	if (img === undefined) {
	    return;
	}
	var hmapCtx = heightmapCanvas.getContext('2d');
	var imgData = hmapCtx.getImageData(0, 0, img.width, img.height);
	var data = imgData.data;
	var zScale = FabInPocket.zScale;
	// Convert array of RGBA to array of height
	var heights = new Array();
	for(var i=0; i < data.length; i+=4) {
	    //	    var h = zScale * (data[i] + data[i+1] + data[i+2]) / 3.0; // height is average of Red/Green/Blue.
	    var h = zScale * data[i]; // height is only Red, because green is used for debugging.
	    heights.push(h);
	    if (zMax == undefined || h > zMax ) {
		zMax = h;
	    }
	}
	return heights;
    }

    /**
     * Create STL Blob from vertices, and link #export-stl to it.
     */
    function prepareSTLExport(vertices, img) {
	var dx = img.width / 2.0;
	var dy = img.height / 2.0;
	// In STL, Vx and Vy must not be negative.
	var sb = '';
	sb += 'solid fabinpocket\n';
	var i=0;
	while (i < vertices.length) {
	    sb += ' facet normal 0.0 0.0 0.0\n  outer loop\n';
	    sb += '    vertex ' + (dx + vertices[i]) + ' ' + (dy + vertices[i+1]) + ' ' + vertices[i+2] + '\n';
	    i += 3;
	    sb += '    vertex ' + (dx + vertices[i]) + ' ' + (dy + vertices[i+1]) + ' ' + vertices[i+2] + '\n';
	    i += 3;
	    sb += '    vertex ' + (dx + vertices[i]) + ' ' + (dy + vertices[i+1]) + ' ' + vertices[i+2] + '\n';
	    i += 3;
	    sb += '  endloop\n endfacet\n';
	}
	sb += 'ensolid fabinpocket\n';
	var exportLink = document.getElementById('export-stl');
	var blob = new Blob([sb], {type: "octet/stream"});
        var url = window.URL.createObjectURL(blob);
	exportLink.setAttribute('href', url);
    }

    /**
     * Link #export-png to computed heightmap.
     */
    function preparePNGExport() {
	var exportLink = document.getElementById('export-png');
	var canvas = document.getElementById("computedheightmapcanvas");
	exportLink.href = canvas.toDataURL('image/png');
    }
    
    function reload3D(img, loadImageIntoCanvas) {
	// heightmapCanvas.width = 640;
	// heightmapCanvas.height = 400;
	var hmapCtx = heightmapCanvas.getContext('2d');
	if (loadImageIntoCanvas) {
	    img.src = imgTag.src;
	    heightmapCanvas.width = img.width;
	    heightmapCanvas.height = img.height;
	    hmapCtx.drawImage(img, 0, 0);
	    FabInPocket.zScale = parseFloat(document.getElementById('heightmap').getAttribute('z-scale'));
	    if (FabInPocket.zScale === undefined) {
		FabInPocket.zScale = 1.0;
	    }
	}

	zMax = undefined;
	var heights = loadHeights(heightmapCanvas, img);
	var zScale = FabInPocket.zScale;
	console.log("zScale=" + zScale);
        loadImageToComputedheightmapcanvas(heights, img, zScale);
	heights = loadHeights( document.getElementById("computedheightmapcanvas"), img);
	
	// Convert heights to vertices
	var vertices = new Array();
	for(var y=0; y < (img.height-1); y++) {
	    for(var x=0; x < (img.width-1); x++) {
		var z_xy = heights[x + (y * img.width)];
		var z_x1y = heights[x + 1 + (y * img.width)];
		var z_xy1 = heights[x + ((y+1) * img.width)];
		var z_x1y1 = heights[x + 1 + ((y + 1) * img.width)];
		
		outputQuad(vertices,
			   [
			       {'x': x - img.width / 2.0, 'y': img.height / 2.0 - y, 'z': z_xy},
			       {'x': x + 1 - img.width / 2.0, 'y': img.height / 2.0 - y, 'z': z_x1y},
			       {'x': x - img.width / 2.0, 'y': img.height / 2.0 - y - 1, 'z': z_xy1},
			       {'x': x + 1 - img.width / 2.0, 'y': img.height / 2.0 - y - 1, 'z': z_x1y1}
			   ]);
	    }
	}
	if (vertices.length === 0) {
	    vertices = undefined;
	}
	return vertices;
    }
    
    var horizAspect = 480.0/640.0;
    
    var squareVerticesBuffer;
    var vertices;
    var img;
    
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera( 75, 600.0 / 400.0, 0.1, 50000 );
    var renderer = new THREE.WebGLRenderer({canvas: glcanvas});
    var geometry = new THREE.BoxGeometry( 1, 1, 1 );
    var material = new THREE.MeshPhongMaterial({ color: 0x68688a, ambient: 0xffffff, shininess: 30, reflectivity: 30});
    var cube = new THREE.Mesh( geometry, material );
    var mesh = undefined;

    function initBuffers(loadImageIntoCanvas) {
	
	vertices = [
		-1.0, -1.0, -1.0,
	         1.0,  1.0, -1.0,
	         1.0, -1.0, -1.0,
	         1.0, -1.0,  1.0,
	         1.0, -1.0, -1.0,
	         1.0,  1.0, -1.0
	];
	var newImg = loadImageIntoCanvas ? new Image() : img;
	console.log("before relaod3D");
	var v = reload3D(newImg, loadImageIntoCanvas);
	console.log("after relaod3D");
	if (v !== undefined) {
	    vertices = v;
	}
	prepareSTLExport(vertices, newImg);
	preparePNGExport();
	console.log("before adding mesh");
	geometry = new THREE.BufferGeometry();
	var vFA = new Float32Array(vertices.length);
	for(var i=0; i < vertices.length; i++) {
	    vFA[i] = vertices[i];
	}
	geometry.addAttribute('position', new THREE.BufferAttribute(vFA, 3));
	geometry.computeFaceNormals();
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
	if (mesh != undefined) {
	    scene.remove(mesh);
	}
	mesh = new THREE.Mesh(geometry, material);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.position.x -= mesh.position.x / 2.0;
	mesh.position.y -= mesh.position.y / 2.0;
	scene.add(mesh);
	console.log("after adding mesh");
	img = newImg;
    }

    var spotLight;
    function init() {
	//img = undefined;
	
	renderer.setSize(600, 400);
	renderer.setClearColor(0xffffff, 1);
	renderer.shadowMapEnabled = true;
	scene.add( cube );
	
	// draw a floor (plane) for the cube to sit on 
	var planeGeometry = new THREE.PlaneBufferGeometry(640, 400);
	var planeMaterial = new THREE.MeshPhongMaterial({ color: 0xefefef });
	var plane = new THREE.Mesh(planeGeometry, planeMaterial);
	// make the plane recieve shadow from the cube
	plane.castShadow = true;
	plane.receiveShadow = true;
	plane.receiveShadow = true;
	scene.add(plane);
	

	var light = new THREE.AmbientLight( 0x404040 ); // soft white light
	scene.add( light );

	spotLight = new THREE.SpotLight( 0xffffff);
	spotLight.position.set(0, 0, 100);
	spotLight.castShadow = true;
	spotLight.shadowDarkness = 0.5;
//			spotLight.shadowCameraVisible = true;
	spotLight.castShadow = true;
	spotLight.shadowMapWidth = 512;
	spotLight.shadowMapHeight = 512;
	spotLight.intensity = 1;
	spotLight.shadowDarkness = 0.1;
	spotLight.shadowCameraNear = true;   // this line makes the shadow appear, hooray!
	scene.add( spotLight );


	
	camera.position.x = 5;
	camera.position.y = 5;
	camera.position.z = 5;
	camera.up.set(0, 0, 1);
	camera.lookAt(new THREE.Vector3(0, 0, 0 ));
	initBuffers(true);
	loop(performance.now());
    }
    
    var lastFrameTime = undefined;
    var up = new Float32Array([0,0,1]);
    var projection = new Float32Array(16);
    var view = new Float32Array(16);
    var eyePosition = new Float32Array([0, 0, 255]);
    var lookAt = new Float32Array([0, 0, 0]);
    var viewProjection = new Float32Array(16);
    var viewInverse = new Float32Array(16);
    var viewProjectionInverse = new Float32Array(16);
    // var fast = tdl.fast;
    // var math = tdl.math;
    var lastTime;
    var angularSpeed = 0.02;
    var sphere = undefined;
    function loop(frameTime) {
	FabInPocket.stopLoop = window.requestAnimationFrame( loop );

	if (img === undefined) {
	    return;
	}
	
	var elapsedTime;
	if (lastFrameTime == undefined) {
	    elapsedTime = 1.0;
	} else {
	    elapsedTime = frameTime - lastFrameTime;
	}
	lastFrameTime = frameTime;

	var time = (new Date()).getTime();
        var timeDiff = time - lastTime;
	lastTime = time;
	fpsTimer.update(elapsedTime);
	document.getElementById('fps').innerHTML = fpsTimer.averageFPS;
	
	// // Compute new eye position
	var dist = (heightmapCanvas.clientWidth + heightmapCanvas.clientHeight + zMax) / 3.0;
	dist = (img.width + img.height + zMax) / 3.0;
	dist = dist / 3.0;
	if (mesh != undefined && mesh.geometry != undefined) {
	    mesh.geometry.computeBoundingSphere();
	    dist = mesh.geometry.boundingSphere.radius;
	}
	// dist = 1;
	camera.position.x = Math.sin(frameTime * 0.0003) * 1 * dist;
	camera.position.y = Math.cos(frameTime * 0.0003) * 1 * dist;
	camera.position.z = 1.5 * dist;
	camera.lookAt(new THREE.Vector3(0, 0, 0 ));
	spotLight.position.z = 5 * dist;

	renderer.render(scene, camera);
    }
    
    document.fabinpocketInit = init;
    document.fabinpocketUpdate3D = initBuffers;
    document.addEventListener("DOMContentLoaded", init); // Start the cycle
})(jQuery);

(function($) {
    "use strict";

    function update3D(loadImageIntoCanvas) {
	console.log("Updating...");
	$('#loading-container').addClass('fa fa-spinner fa-spin');
	//TODO: launch in background?
	document.fabinpocketUpdate3D(loadImageIntoCanvas);
	$('#loading-container').removeClass('fa fa-spinner fa-spin');
    }

    function update3DFromCanvas() {
	update3D(false);
    }

    var update3DTimeout = undefined;
    function delayedUpdate3D() {
	if (update3DTimeout !== undefined) {
	    window.clearTimeout(update3DTimeout);
	}
	update3DTimeout = window.setTimeout(update3DFromCanvas, 750);
    }
    
    $(document).ready(function() {
	
	/**
         * Update 3D view when image #heightmap is changed.
         */
	$("#heightmap").on('load', function() {
	    update3D(true);
	});

	/**
         * Manage tabs
         */
	$('.tabs__tab').click(function(event) {
	    $('.tabs__tab').removeClass('is-active');
	    $(this).addClass('is-active');
	    $('.tabs__panel').removeClass('is-active');
	    $($(this).attr('href')).addClass('is-active');
	    event.preventDefault();
	    return false;
	});

	/**
         * Manage menu
         */	
	$('#menu-button').click(function(event) {
	    $('.menu').toggleClass('is-active');
	    event.preventDefault();
	    return false;
	});

	/**
         * Manage file upload
         */
	var urlObject = window.URL || window.webkitURL;
	$('#file-upload').change(function (event) {
	    var filename = $(this).val();
	    var file = this.files[0];
	    
	    console.log('loading new image: ' + filename);
	    // Update 3D view once image loaded.
	    // See http://stackoverflow.com/questions/3877027/jquery-callback-on-image-load-even-when-the-image-is-cached
	    // See https://developer.mozilla.org/en-US/docs/Using_files_from_web_applications
	    $("#heightmap").attr('src', urlObject.createObjectURL(file));
	    $("#heightmap").each(function() {
		if (this.complete) {
		    update3D(true);
		} else {
		    console.log('not complete');
		}
	    });	    
	    $('.menu').toggleClass('is-active');
	});

	$('#white-pencil-btn').click(function (event) {
	    pencil.color = 'white';
	    $('.menu').toggleClass('is-active');
	    event.preventDefault();
	    return false;
	});

	$('#black-eraser-btn').click(function (event) {
	    pencil.color = 'black';
	    $('.menu').toggleClass('is-active');
	    event.preventDefault();
	    return false;
	});
	
	/**
         * Manage canvas clearance
         */
	$('#clear-btn').click(function (evt) {
	    $('.menu').toggleClass('is-active');
	    var canvas = $('#shapecanvas')[0];
	    var context = canvas.getContext('2d');
	    context.fillStyle='black';
	    context.fillRect(0, 0, canvas.width, canvas.height);
	    delayedUpdate3D();
	    evt.preventDefault();
	    return false;
	});
	
	/*========================== Canvas drawing ========================================*/
	var tool = {};
	var context = $('#shapecanvas')[0].getContext('2d');

	/**
	 * Convert event's coordinates to canvas coordinates as canvas may be stretched.
	 */
	function updateCanvasCoordinates(ev) {
	    var canvas = $('#shapecanvas')[0];
	    var rect = canvas.getBoundingClientRect();
	    ev.canvasX = ev.offsetX * canvas.width / rect.width;
	    ev.canvasY = ev.offsetY * canvas.height / rect.height;
	}
	
	var pencil = {
	    size: 10,
	    color: 'white',
	    start: function(ev) {
		updateCanvasCoordinates(ev);
		drawCircle(context, ev);
		context.beginPath();
		context.lineWidth = pencil.size;
		context.fillStyle = pencil.color;
		context.strokeStyle = pencil.color;
		context.moveTo(ev.canvasX, ev.canvasY);		
		tool.started = true;
		delayedUpdate3D();
		ev.preventDefault();
	    },
	    move: function (ev) {
		if (tool.started) {
		    updateCanvasCoordinates(ev);
		    context.lineTo(ev.canvasX, ev.canvasY);
		    context.stroke();
		    delayedUpdate3D();
		    ev.preventDefault();
		}
	    },
	    end: function (ev) {
		if (tool.started) {
		    updateCanvasCoordinates(ev);
		    context.lineTo(ev.canvasX, ev.canvasY);
		    context.stroke();
		    drawCircle(context, ev);
		    delayedUpdate3D();
		    ev.preventDefault();
		}
		tool.started = false;
	    }
	};
	
	function drawCircle(context, ev) {
	    var radius = pencil.size / 2.0;
	    context.moveTo(ev.canvasX, ev.canvasY);
	    context.beginPath();
	    context.lineWidth = 1;
	    context.fillStyle = pencil.color;
	    context.strokeStyle = pencil.color;
	    context.arc(ev.canvasX, ev.canvasY, radius, 0, 2 * Math.PI, true);
	    context.fill();
	}
	
	var shapecanvas = $('#shapecanvas');
	shapecanvas
	    .on('mousedown', pencil.start)
	    .on('touchmove mousemove', pencil.move)
	    .on('touchup mouseup', pencil.end);
	shapecanvas[0].addEventListener('touchstart', pencil.start);
	shapecanvas[0].addEventListener('touchmove', pencil.move);
	shapecanvas[0].addEventListener('touchen', pencil.end);

	$('#tool-size').on('change', function (evt) {
	    pencil.size = parseFloat($(this).val());
	});

	$('#z-scale').on('change', function (evt) {
	    document.FabInPocket.zScale = parseFloat($(this).val());
	    delayedUpdate3D();
	});	
    });
})(jQuery);
