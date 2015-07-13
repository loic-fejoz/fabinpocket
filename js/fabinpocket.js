;
(function(tdl,$) {
    "use strict";    
    var FabInPocket = {};
    var glcanvas = FabInPocket.glcanvas = document.getElementById('previewcanvas');
    glcanvas.width = 640;
    glcanvas.height = 400;
    var gl = tdl.webgl.setupWebGL(glcanvas);
    if (!gl) {
	alert("Unable to initialize WebGL. Your browser may not support it.");
    }
    
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
	var zScale = parseFloat(document.getElementById('heightmap').getAttribute('z-scale'));
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
	    sb += 'facet normal 0.0 0.0 0.0\n  outer loop\n';
	    sb += '    vertex ' + (dx + vertices[i]) + ' ' + (dy + vertices[i+1]) + ' ' + vertices[i+2] + '\n';
	    i += 3;
	    sb += '    vertex ' + (dx + vertices[i]) + ' ' + (dy + vertices[i+1]) + ' ' + vertices[i+2] + '\n';
	    i += 3;
	    sb += '    vertex ' + (dx + vertices[i]) + ' ' + (dy + vertices[i+1]) + ' ' + vertices[i+2] + '\n';
	    i += 3;
	    sb += '  endloop\nendfacet\n';
	}
	sb += 'ensolid\n';
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
	}

	zMax = undefined;
	var heights = loadHeights(heightmapCanvas, img);
	var zScale = parseFloat(document.getElementById('heightmap').getAttribute('z-scale'));
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
    function initBuffers(loadImageIntoCanvas) {
	squareVerticesBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, squareVerticesBuffer);
	
	vertices = [
		-1.0, -1.0, -1.0,
	         1.0,  1.0, -1.0,
	         1.0, -1.0, -1.0,
	         1.0, -1.0,  1.0,
	         1.0, -1.0, -1.0,
	         1.0,  1.0, -1.0
	];
	var newImg = loadImageIntoCanvas ? new Image() : img;
	var v = reload3D(newImg, loadImageIntoCanvas);
	if (v !== undefined) {
	    vertices = v;
	}
	prepareSTLExport(vertices, newImg);
	preparePNGExport();
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
	img = newImg;
    }
    
    var g_fpsTimer;           // object to measure frames per second;
    
    function init() {
	img = undefined;
  	if (gl) {
    	    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); // See http://webglfundamentals.org/webgl/lessons/webgl-anti-patterns.html
            gl.clearColor(0.9, 0.9, 0.9, 1.0);  // Set clear color to dark blue, fully opaque
            gl.clearDepth(1.0);                 // Clear everything
            gl.enable(gl.DEPTH_TEST);           // Enable depth testing
            gl.enable(gl.CULL_FACE);
            gl.depthFunc(gl.LESS);            // Near things obscure far things
            initShaders();
            initBuffers(true);
            g_fpsTimer = new tdl.fps.FPSTimer();
            loop(performance.now());
        }
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
    var fast = tdl.fast;
    var math = tdl.math;
    function loop(frameTime) {
	FabInPocket.stopLoop = window.requestAnimationFrame( loop );

	if (img === undefined) {
	    return;
	}
	
	var elapsedTime;
	if (lastFrameTime == undefined) {
	    elapsedTime = 0.0;
	} else {
	    elapsedTime = (frameTime - lastFrameTime) * 0.001;
	}
	lastFrameTime = frameTime;
	g_fpsTimer.update(elapsedTime);
	document.getElementById('fps').innerHTML = g_fpsTimer.averageFPS;
	
	// Compute new eye position
	var dist = (heightmapCanvas.clientWidth + heightmapCanvas.clientHeight + zMax) / 3.0;
	dist = (img.width + img.height + zMax) / 3.0;
	eyePosition[0] = Math.sin(frameTime * 0.0003) * 1.5 * dist;
	eyePosition[1] = Math.cos(frameTime * 0.0003) * 1.5 * dist;
  	eyePosition[2] = dist;
    	
	// Clear the canvas before we start drawing on it.
	
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	
	fast.matrix4.perspective(
            projection,
            math.degToRad(60),
            glcanvas.clientWidth / glcanvas.clientHeight,
            1,
            5000);
    	fast.matrix4.lookAt(
            view,
            eyePosition,
            lookAt,
            up);
    	fast.matrix4.mul(viewProjection, view, projection);
	
	gl.bindBuffer(gl.ARRAY_BUFFER, squareVerticesBuffer);
	gl.vertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);
	
	var mvUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
  	gl.uniformMatrix4fv(mvUniform, false, viewProjection);
	
	var zMaxUniform = gl.getUniformLocation(shaderProgram, "zMax");
  	gl.uniform1f(zMaxUniform, zMax);
	
	gl.drawArrays(gl.TRIANGLES, 0, Math.floor(vertices.length / 3));
    }
    
    document.fabinpocketInit = init;
    document.fabinpocketUpdate3D = initBuffers;
    document.addEventListener("DOMContentLoaded", init); // Start the cycle
})(tdl);

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
	})

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
	
	var toolSize = 10;

	function drawCircle(context, ev) {
	    var radius = toolSize / 2.0;
	    context.moveTo(ev.canvasX, ev.canvasY);
	    context.beginPath();
	    context.lineWidth = 1;
	    context.fillStyle = 'white';
	    context.strokeStyle = 'white';
	    context.arc(ev.canvasX, ev.canvasY, radius, 0, 2 * Math.PI, true);
	    context.fill();
	}

	var pencil = {
	    start: function(ev) {
		updateCanvasCoordinates(ev);
		drawCircle(context, ev);
		context.beginPath();
		context.lineWidth = toolSize;
		context.fillStyle = 'white';
		context.strokeStyle = 'white';
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
	}
	
	var shapecanvas = $('#shapecanvas');
	shapecanvas
	    .on('mousedown', pencil.start)
	    .on('touchmove mousemove', pencil.move)
	    .on('touchup mouseup', pencil.end);
	shapecanvas[0].addEventListener('touchstart', pencil.start);
	shapecanvas[0].addEventListener('touchmove', pencil.move);
	shapecanvas[0].addEventListener('touchen', pencil.end);
    });
})(jQuery);
