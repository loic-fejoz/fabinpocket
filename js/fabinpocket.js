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
    function initShaders() {
	shaderProgram = tdl.programs.loadProgram(
	    document.getElementById("shader-vs").textContent,
	    document.getElementById("shader-fs").textContent).program;
	
	gl.useProgram(shaderProgram);
	
	vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition_modelspace");
	gl.enableVertexAttribArray(vertexPositionAttribute);
    }
    
    function outputPoint(vertices, point) {
	vertices.push(point.x);
	vertices.push(point.y);
	vertices.push(point.z);
	//console.log(point);
    }
    
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
    
    function outputQuad(vertices, points) {
	// assert(points.length == 4);
	outputTriangle(vertices, [points[0], points[3], points[1]]);
	outputTriangle(vertices, [points[0], points[2], points[3]]);
    }
    
    var heightmapCanvas = document.getElementById("shapecanvas");
    var zMax = undefined;
    var imgTag = document.getElementById("heightmap");
    var img = new Image();
    var zScale = parseFloat(imgTag.getAttribute('z-scale'));
    
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

    function sweep(data, img) {
	sweepTopToBottom(data, img);
	sweepBottomToTop(data, img);
	sweepLeftToRight(data, img);
	sweepRightToLeft(data, img);
    }
    
    function loadImageToTestCanvas(heights, img, zScale) {
	var canvas = document.getElementById("testcanvas");
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

    function loadHeights(heightmapCanvas) {
	var hmapCtx = heightmapCanvas.getContext('2d');
	var imgData = hmapCtx.getImageData(0, 0, img.width, img.height);
	var data = imgData.data;
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

    function preparePNGExport() {
	var exportLink = document.getElementById('export-png');
	var canvas = document.getElementById("testcanvas");
	exportLink.href = canvas.toDataURL('image/png');
    }
    
    function loadImage() {
	img.src = imgTag.src;
	heightmapCanvas.width = img.width;
	heightmapCanvas.height = img.height;
	// heightmapCanvas.width = 640;
	// heightmapCanvas.height = 400;
	var hmapCtx = heightmapCanvas.getContext('2d');
	hmapCtx.drawImage(img, 0, 0);
	var heights = loadHeights(heightmapCanvas);
	var zScale = parseFloat(document.getElementById('heightmap').getAttribute('z-scale'));
	console.log("zScale=" + zScale);
        loadImageToTestCanvas(heights, img, zScale);
	heights = loadHeights( document.getElementById("testcanvas"));

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
	function initBuffers() {
	  squareVerticesBuffer = gl.createBuffer();
	  gl.bindBuffer(gl.ARRAY_BUFFER, squareVerticesBuffer);
	  
	  vertices = [
	    -1.0,  -1.0,  -1.0,
	     1.0,  1.0, -1.0,
	     1.0, -1.0, -1.0,
	     1.0, -1.0,  1.0,
	     1.0, -1.0, -1.0,
	     1.0,  1.0, -1.0
	  ];
	  var v = loadImage();
	  if (v !== undefined) {
	  	vertices = v;
	  }
	    prepareSTLExport(vertices, img);
	    preparePNGExport();
	  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
	}

	var g_fpsTimer;           // object to measure frames per second;

  	function init() {
  		if (gl) {
    		gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); // See http://webglfundamentals.org/webgl/lessons/webgl-anti-patterns.html
        	gl.clearColor(0.9, 0.9, 0.9, 1.0);  // Set clear color to dark blue, fully opaque
          	gl.clearDepth(1.0);                 // Clear everything
          	gl.enable(gl.DEPTH_TEST);           // Enable depth testing
          	gl.enable(gl.CULL_FACE);
          	gl.depthFunc(gl.LESS);            // Near things obscure far things
          	initShaders();
          	initBuffers();
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


    document.addEventListener("DOMContentLoaded", init); // Start the cycle
})(tdl);

(function($) {
    "use strict";
    
    $(document).ready(function() {
	$('.tabs__tab').click(function() {
	    $('.tabs__tab').removeClass('is-active');
	    $(this).addClass('is-active');
	    $('.tabs__panel').removeClass('is-active');
	    $($(this).attr('href')).addClass('is-active');
	    return false;
	});
    });
})(jQuery);
