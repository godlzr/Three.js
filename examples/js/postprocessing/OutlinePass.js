/**
 * @author spidersharma / http://eduperiment.com/
 */

THREE.OutlinePass = function ( resolution, scene, camera, selectedObjects ) {

	this.renderScene = scene;
	this.renderCamera = camera;
	this.selectedObjects = selectedObjects !== undefined ? selectedObjects : [];
	this.visibleEdgeColor = new THREE.Color(1, 1, 1);
	this.hiddenEdgeColor = new THREE.Color(0.1, 0.04, 0.02);
	this.edgeThickness = 1.0;
	this.edgeStrength = 3.0;
	this.downSampleRatio = 2;
	this.pulsePeriod = 0;

	THREE.Pass.call( this );

	this.resolution = ( resolution !== undefined ) ? new THREE.Vector2(resolution.x, resolution.y) : new THREE.Vector2(256, 256);

	var pars = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };

	var resx = Math.round(this.resolution.x/this.downSampleRatio);
	var resy = Math.round(this.resolution.y/this.downSampleRatio);

	this.maskBufferMaterial = new THREE.MeshBasicMaterial({color:0xffffff});
	this.maskBufferMaterial.side = THREE.DoubleSide;
	this.renderTargetMaskBuffer = new THREE.WebGLRenderTarget( this.resolution.x, this.resolution.y, pars );
	this.renderTargetMaskBuffer.texture.generateMipmaps = false;

	this.depthMaterial = new THREE.MeshDepthMaterial();
	this.depthMaterial.side = THREE.DoubleSide;
	this.depthMaterial.depthPacking = THREE.RGBADepthPacking;
	this.depthMaterial.blending = THREE.NoBlending;

	this.prepareMaskMaterial = this.getPrepareMaskMaterial();
	this.prepareMaskMaterial.side = THREE.DoubleSide;

	this.renderTargetDepthBuffer = new THREE.WebGLRenderTarget( this.resolution.x, this.resolution.y, pars );
	this.renderTargetDepthBuffer.texture.generateMipmaps = false;

	this.renderTargetMaskDownSampleBuffer = new THREE.WebGLRenderTarget( resx, resy, pars );
	this.renderTargetMaskDownSampleBuffer.texture.generateMipmaps = false;

	this.renderTargetBlurBuffer1 = new THREE.WebGLRenderTarget( resx, resy, pars );
	this.renderTargetBlurBuffer1.texture.generateMipmaps = false;
	this.renderTargetBlurBuffer2 = new THREE.WebGLRenderTarget( Math.round(resx/2), Math.round(resy/2), pars );
	this.renderTargetBlurBuffer2.texture.generateMipmaps = false;

	this.edgeDetectionMaterial = this.getEdgeDetectionMaterial();
	this.renderTargetEdgeBuffer1 = new THREE.WebGLRenderTarget( resx, resy, pars );
	this.renderTargetEdgeBuffer1.texture.generateMipmaps = false;
	this.renderTargetEdgeBuffer2 = new THREE.WebGLRenderTarget( Math.round(resx/2), Math.round(resy/2), pars );
	this.renderTargetEdgeBuffer2.texture.generateMipmaps = false;

	this.separableBlurMaterial1 = this.getSeperableBlurMaterial(2);
	this.separableBlurMaterial1.uniforms[ "texSize" ].value = new THREE.Vector2(resx, resy);
	this.separableBlurMaterial2 = this.getSeperableBlurMaterial(4);
	this.separableBlurMaterial2.uniforms[ "texSize" ].value = new THREE.Vector2(Math.round(resx/2), Math.round(resy/2));

	// Overlay material
	this.overlayMaterial = this.getOverlayMaterial();

	// copy material
	if ( THREE.CopyShader === undefined )
		console.error( "THREE.OutlinePass relies on THREE.CopyShader" );

	var copyShader = THREE.CopyShader;

	this.copyUniforms = THREE.UniformsUtils.clone( copyShader.uniforms );
	this.copyUniforms[ "opacity" ].value = 1.0;

	this.materialCopy = new THREE.ShaderMaterial( {
		uniforms: this.copyUniforms,
		vertexShader: copyShader.vertexShader,
		fragmentShader: copyShader.fragmentShader,
		blending: THREE.NoBlending,
		depthTest: false,
		depthWrite: false,
		transparent: true
	} );

	this.enabled = true;
	this.needsSwap = false;

	this.oldClearColor = new THREE.Color();
	this.oldClearAlpha = 1;

	this.camera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
	this.scene  = new THREE.Scene();

	this.quad = new THREE.Mesh( new THREE.PlaneBufferGeometry( 2, 2 ), null );
	this.scene.add( this.quad );

	var onLoad = function ( texture ) {
		this.trianglePatternTexture = texture;
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.RepeatWrapping;
	};

	var loader = new THREE.TextureLoader();

	// load a resource
	loader.load(
		// resource URL
		'textures/tri_pattern.jpg',
		// Function when resource is loaded
		onLoad.bind(this)
	);

	this.tempPulseColor1 = new THREE.Color();
	this.tempPulseColor2 = new THREE.Color();
	this.textureMatrix = new THREE.Matrix4();
};

THREE.OutlinePass.prototype = Object.assign( Object.create( THREE.Pass.prototype ), {

	constructor: THREE.OutlinePass,

	dispose: function() {
		this.renderTargetMaskBuffer.dispose();
		this.renderTargetDepthBuffer.dispose();
		this.renderTargetMaskDownSampleBuffer.dispose();
		this.renderTargetBlurBuffer1.dispose();
		this.renderTargetBlurBuffer2.dispose();
		this.renderTargetEdgeBuffer1.dispose();
		this.renderTargetEdgeBuffer2.dispose();
	},

	setSize: function ( width, height ) {

		this.renderTargetMaskBuffer.setSize(width, height );

		var resx = Math.round(width/this.downSampleRatio);
		var resy = Math.round(height/this.downSampleRatio);
		this.renderTargetMaskDownSampleBuffer.setSize(resx, resy );
		this.renderTargetBlurBuffer1.setSize(resx, resy );
		this.renderTargetEdgeBuffer1.setSize(resx, resy );
		this.separableBlurMaterial1.uniforms[ "texSize" ].value = new THREE.Vector2(resx, resy);

	  resx = Math.round(resx/2);
	  resy = Math.round(resy/2);

		this.renderTargetBlurBuffer2.setSize(resx, resy );
		this.renderTargetEdgeBuffer2.setSize(resx, resy );

		this.separableBlurMaterial2.uniforms[ "texSize" ].value = new THREE.Vector2(resx, resy);
	},

	changeVisibilityOfSelectedObjects: function( bVisible ) {

		var gatherSelectedMeshesCallBack = function( object ) {

			if( object instanceof THREE.Mesh ) {
				object.visible = bVisible;
			}
		}

		for( var i=0; i<this.selectedObjects.length; i++ ) {

			var selectedObject = this.selectedObjects[i];

			selectedObject.traverse( gatherSelectedMeshesCallBack );
		}
	},

	changeVisibilityOfNonSelectedObjects: function( bVisible ) {

		var selectedMeshes = [];

		var gatherSelectedMeshesCallBack = function( object ) {

			if( object instanceof THREE.Mesh ) {

				selectedMeshes.push(object);

			}
		}

		for( var i=0; i<this.selectedObjects.length; i++ ) {

			var selectedObject = this.selectedObjects[i];

			selectedObject.traverse( gatherSelectedMeshesCallBack );
		}

		var VisibilityChangeCallBack = function( object ) {

			if( object instanceof THREE.Mesh ) {

				var bFound = false;

				for( var i=0; i<selectedMeshes.length; i++ ) {

					var selectedObjectId = selectedMeshes[i].id;

					if(selectedObjectId === object.id) {
						bFound = true;
						break;
					}

				}
				if(!bFound) {
					var visibility = object.visible;
					if( !bVisible || object.bVisible )
						object.visible = bVisible;
					object.bVisible = visibility;
				}
			}
		}
		this.renderScene.traverse( VisibilityChangeCallBack );
	},

	updateTextureMatrix: function() {

		this.textureMatrix.set( 0.5, 0.0, 0.0, 0.5,
														0.0, 0.5, 0.0, 0.5,
														0.0, 0.0, 0.5, 0.5,
														0.0, 0.0, 0.0, 1.0 );
		this.textureMatrix.multiply( this.renderCamera.projectionMatrix );
		this.textureMatrix.multiply( this.renderCamera.matrixWorldInverse );

	},

	render: function ( renderer, writeBuffer, readBuffer, delta, maskActive ) {

		if(this.selectedObjects.length === 0 )
			return;

		this.oldClearColor.copy( renderer.getClearColor() );
		this.oldClearAlpha = renderer.getClearAlpha();
		var oldAutoClear = renderer.autoClear;

		renderer.autoClear = false;

		if ( maskActive ) renderer.context.disable( renderer.context.STENCIL_TEST );

		renderer.setClearColor( 0xffffff, 1 );

		// Make selected objects invisible
		this.changeVisibilityOfSelectedObjects(false);

		// 1. Draw Non Selected objects in the depth buffer
		this.renderScene.overrideMaterial = this.depthMaterial;
		renderer.render( this.renderScene, this.renderCamera, this.renderTargetDepthBuffer, true );

		// Make selected objects visible
		this.changeVisibilityOfSelectedObjects(true);

		// Update Texture Matrix for Depth compare
		this.updateTextureMatrix();

		// Make non selected objects invisible, and draw only the selected objects, by comparing the depth buffer of non selected objects
		this.changeVisibilityOfNonSelectedObjects(false);
		this.renderScene.overrideMaterial = this.prepareMaskMaterial;
		this.prepareMaskMaterial.uniforms[ "cameraNearFar" ].value = new THREE.Vector2(this.renderCamera.near, this.renderCamera.far);
		this.prepareMaskMaterial.uniforms[ "depthTexture" ].value = this.renderTargetDepthBuffer.texture;
		this.prepareMaskMaterial.uniforms[ "textureMatrix" ].value = this.textureMatrix;
		renderer.render( this.renderScene, this.renderCamera, this.renderTargetMaskBuffer, true );
		this.renderScene.overrideMaterial = null;
		this.changeVisibilityOfNonSelectedObjects(true);

		// 2. Downsample to Half resolution
		this.quad.material = this.materialCopy;
		this.copyUniforms[ "tDiffuse" ].value = this.renderTargetMaskBuffer.texture;
		renderer.render( this.scene, this.camera, this.renderTargetMaskDownSampleBuffer, true );

		this.tempPulseColor1.copy( this.visibleEdgeColor );
		this.tempPulseColor2.copy( this.hiddenEdgeColor );
		if( this.pulsePeriod > 0 ) {
			var scalar = ( 1 + 0.25 ) / 2 + Math.cos( performance.now() * 0.01/ this.pulsePeriod ) * ( 1.0 - 0.25 )
			this.tempPulseColor1.multiplyScalar( scalar );
			this.tempPulseColor2.multiplyScalar( scalar );
		}

		// 3. Apply Edge Detection Pass
		this.quad.material = this.edgeDetectionMaterial;
		this.edgeDetectionMaterial.uniforms[ "maskTexture" ].value = this.renderTargetMaskDownSampleBuffer.texture;
		this.edgeDetectionMaterial.uniforms[ "texSize" ].value = new THREE.Vector2(this.renderTargetMaskDownSampleBuffer.width, this.renderTargetMaskDownSampleBuffer.height);
		this.edgeDetectionMaterial.uniforms[ "edgeThickness" ].value = this.edgeThickness;
		this.edgeDetectionMaterial.uniforms[ "visibleEdgeColor" ].value = this.tempPulseColor1;
		this.edgeDetectionMaterial.uniforms[ "hiddenEdgeColor" ].value = this.tempPulseColor2;
		renderer.render( this.scene, this.camera, this.renderTargetEdgeBuffer1, true );

		// 4. Apply Blur on Half res
		this.quad.material = this.separableBlurMaterial1;
		this.separableBlurMaterial1.uniforms[ "colorTexture" ].value = this.renderTargetEdgeBuffer1.texture;
		this.separableBlurMaterial1.uniforms[ "direction" ].value = THREE.OutlinePass.BlurDirectionX;
		renderer.render( this.scene, this.camera, this.renderTargetBlurBuffer1, true );
		this.separableBlurMaterial1.uniforms[ "colorTexture" ].value = this.renderTargetBlurBuffer1.texture;
		this.separableBlurMaterial1.uniforms[ "direction" ].value = THREE.OutlinePass.BlurDirectionY;
		renderer.render( this.scene, this.camera, this.renderTargetEdgeBuffer1, true );

		// Apply Blur on quarter res
		this.quad.material = this.separableBlurMaterial2;
		this.separableBlurMaterial2.uniforms[ "colorTexture" ].value = this.renderTargetEdgeBuffer1.texture;
		this.separableBlurMaterial2.uniforms[ "direction" ].value = THREE.OutlinePass.BlurDirectionX;
		renderer.render( this.scene, this.camera, this.renderTargetBlurBuffer2, true );
		this.separableBlurMaterial2.uniforms[ "colorTexture" ].value = this.renderTargetBlurBuffer2.texture;
		this.separableBlurMaterial2.uniforms[ "direction" ].value = THREE.OutlinePass.BlurDirectionY;
		renderer.render( this.scene, this.camera, this.renderTargetEdgeBuffer2, true );

		// Blend it additively over the input texture
		this.quad.material = this.overlayMaterial;
		this.overlayMaterial.uniforms[ "maskTexture" ].value = this.renderTargetMaskBuffer.texture;
		this.overlayMaterial.uniforms[ "edgeTexture1" ].value = this.renderTargetEdgeBuffer1.texture;
		this.overlayMaterial.uniforms[ "edgeTexture2" ].value = this.renderTargetEdgeBuffer2.texture;
		this.overlayMaterial.uniforms[ "trianglePatternTexture" ].value = this.trianglePatternTexture;
		this.overlayMaterial.uniforms[ "edgeStrength" ].value = this.edgeStrength;

		if ( maskActive ) renderer.context.enable( renderer.context.STENCIL_TEST );

		renderer.render( this.scene, this.camera, readBuffer, false );

		renderer.setClearColor( this.oldClearColor, this.oldClearAlpha );
		renderer.autoClear = oldAutoClear;
	},

	getPrepareMaskMaterial: function() {

		return new THREE.ShaderMaterial( {

			uniforms: {
				"depthTexture": { value: null },
				"cameraNearFar": { value: new THREE.Vector2( 0.5, 0.5 ) },
				"textureMatrix" : { value: new THREE.Matrix4() }
			},

			vertexShader:
				"varying vec2 vUv;\
				varying vec4 projTexCoord;\
				varying vec4 vPosition;\
				uniform mat4 textureMatrix;\
				void main() {\
					vUv = uv;\
					vPosition = modelViewMatrix * vec4( position, 1.0 );\
					vec4 worldPosition = modelMatrix * vec4( position, 1.0 );\
					projTexCoord = textureMatrix * worldPosition;\
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n\
				}",

			fragmentShader:
				"#include <packing>\
				varying vec2 vUv;\
				varying vec4 vPosition;\
				varying vec4 projTexCoord;\
				uniform sampler2D depthTexture;\
				uniform vec2 cameraNearFar;\
				\
				void main() {\
					float depth = unpackRGBAToDepth(texture2DProj( depthTexture, projTexCoord ));\
					float viewZ = -perspectiveDepthToViewZ( depth, cameraNearFar.x, cameraNearFar.y );\
					float depthTest = (-vPosition.z > viewZ) ? 1.0 : 0.0;\
					gl_FragColor = vec4(0.0, depthTest, 1.0, 1.0);\
				}"
		} );
	},

	getEdgeDetectionMaterial: function() {

		return new THREE.ShaderMaterial( {

			uniforms: {
				"maskTexture": { value: null },
				"texSize": { value: new THREE.Vector2( 0.5, 0.5 ) },
				"visibleEdgeColor": { value: new THREE.Vector3( 1.0, 1.0, 1.0 ) },
				"hiddenEdgeColor":  { value: new THREE.Vector3( 1.0, 1.0, 1.0 ) },
				"edgeThickness": { value: 1.0 }
			},

			vertexShader:
				"varying vec2 vUv;\n\
				void main() {\n\
					vUv = uv;\n\
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n\
				}",

			fragmentShader:
				"varying vec2 vUv;\
				uniform sampler2D maskTexture;\
				uniform vec2 texSize;\
				uniform float edgeThickness;\
				uniform vec3 visibleEdgeColor;\
				uniform vec3 hiddenEdgeColor;\
				\
				void main() {\n\
					vec2 invSize = 1.0 / texSize;\
					vec2 uvOffset = vec2(1.0, 0.0) * invSize * edgeThickness;\
					vec4 c1 = texture2D( maskTexture, vUv + uvOffset.xy);\
					vec4 c2 = texture2D( maskTexture, vUv - uvOffset.xy);\
					vec4 c3 = texture2D( maskTexture, vUv + uvOffset.yx);\
					vec4 c4 = texture2D( maskTexture, vUv - uvOffset.yx);\
					float diff1 = (c2.r - c1.r)*0.5;\
					float diff2 = (c4.r - c3.r)*0.5;\
					float d = sqrt( diff1 * diff1 + diff2 * diff2);\
					float a1 = min(c1.g, c2.g);\
					float a2 = min(c3.g, c4.g);\
					float factor = min(a1, a2);\
					vec3 edgeColor = 1.0 - factor > 0.001 ? visibleEdgeColor : hiddenEdgeColor;\
					gl_FragColor = vec4(edgeColor, 1.0) * d;\
				}"
		} );
	},

	getSeperableBlurMaterial: function(kernelRadius) {

		return new THREE.ShaderMaterial( {

			defines: {
				"KERNEL_RADIUS" : kernelRadius,
				"SIGMA" : kernelRadius
			},

			uniforms: {
				"colorTexture": { value: null },
				"texSize": 	{ value: new THREE.Vector2( 0.5, 0.5 ) },
				"direction": { value: new THREE.Vector2( 0.5, 0.5 ) },
			},

			vertexShader:
				"varying vec2 vUv;\n\
				void main() {\n\
					vUv = uv;\n\
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n\
				}",

			fragmentShader:
				"#include <common>\
				varying vec2 vUv;\
				uniform sampler2D colorTexture;\
				uniform vec2 texSize;\
				uniform vec2 direction;\
				\
				float gaussianPdf(in float x, in float sigma) {\
					return 0.39894 * exp( -0.5 * x * x/( sigma * sigma))/sigma;\
				}\
				void main() {\
					vec2 invSize = 1.0 / texSize;\
					float fSigma = float(SIGMA);\
					float weightSum = gaussianPdf(0.0, fSigma);\
					vec3 diffuseSum = texture2D( colorTexture, vUv).rgb * weightSum;\
					for( int i = 1; i < KERNEL_RADIUS; i ++ ) {\
						float x = float(i);\
						float w = gaussianPdf(x, fSigma);\
						vec2 uvOffset = direction * invSize * x;\
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset).rgb;\
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset).rgb;\
						diffuseSum += ((sample1 + sample2) * w);\
						weightSum += (2.0 * w);\
					}\
					gl_FragColor = vec4(diffuseSum/weightSum, 1.0);\
				}"
		} );
	},

	getOverlayMaterial: function() {

		return new THREE.ShaderMaterial( {

			uniforms: {
				"maskTexture": { value: null },
				"edgeTexture1": { value: null },
				"edgeTexture2": { value: null },
				"trianglePatternTexture": { value: null },
				"edgeStrength" : { value: 1.0 }
			},

			vertexShader:
				"varying vec2 vUv;\n\
				void main() {\n\
					vUv = uv;\n\
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n\
				}",

			fragmentShader:
				"varying vec2 vUv;\
				uniform sampler2D maskTexture;\
				uniform sampler2D edgeTexture1;\
				uniform sampler2D edgeTexture2;\
				uniform sampler2D trianglePatternTexture;\
				uniform float edgeStrength;\
				\
				void main() {\
					vec4 edgeValue1 = texture2D(edgeTexture1, vUv);\
					vec4 edgeValue2 = texture2D(edgeTexture2, vUv);\
					vec4 maskColor = texture2D(maskTexture, vUv);\
					vec4 triPatternColor = texture2D(trianglePatternTexture, 6.0 * vUv);\
					float factor = 1.0 - maskColor.g > 0.0 ? 1.0 : 0.5;\
					gl_FragColor = edgeStrength * ( edgeValue1 + 0.5*edgeValue2) * maskColor.r + factor * (1.0 - maskColor.r) * (1.0 - triPatternColor.r);\
				}",

				blending: THREE.AdditiveBlending,
				depthTest: false,
				depthWrite: false,
				transparent: true
		} );
	}

} );

THREE.OutlinePass.BlurDirectionX = new THREE.Vector2( 1.0, 0.0 );
THREE.OutlinePass.BlurDirectionY = new THREE.Vector2( 0.0, 1.0 );
