/**
 * @author spidersharma / http://eduperiment.com/
 */

THREE.OutlinePass = function ( resolution, scene, camera, selectedObjects ) {

	this.renderScene = scene;
	this.renderCamera = camera;
	this.selectedObjects = selectedObjects !== undefined ? selectedObjects : [];
	this.edgeColor = new THREE.Color(1, 1, 1);
	this.edgeThickness = 1.0;
	this.edgeStrength = 3.0;
	this.pulsePeroid = 0;	

	THREE.Pass.call( this );

	this.resolution = ( resolution !== undefined ) ? new THREE.Vector2(resolution.x, resolution.y) : new THREE.Vector2(256, 256);

	var pars = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };

	var resx = Math.round(this.resolution.x/2);
	var resy = Math.round(this.resolution.y/2);

	this.maskBufferMaterial = new THREE.MeshBasicMaterial({color:0xffffff});
	this.maskBufferMaterial.side = THREE.DoubleSide;
	this.renderTargetMaskBuffer = new THREE.WebGLRenderTarget( this.resolution.x, this.resolution.y, pars );
	this.renderTargetMaskBuffer.texture.generateMipmaps = false;

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

	this.separableBlurMaterial1 = this.getSeperableBlurMaterial(3);
	this.separableBlurMaterial1.uniforms[ "texSize" ].value = new THREE.Vector2(resx, resy);
	this.separableBlurMaterial2 = this.getSeperableBlurMaterial(5);
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

	this.tempPulseColor = new THREE.Color();
};

THREE.OutlinePass.prototype = Object.assign( Object.create( THREE.Pass.prototype ), {

	constructor: THREE.OutlinePass,

	dispose: function() {
		this.renderTargetMaskBuffer.dispose();
		this.renderTargetMaskDownSampleBuffer.dispose();
		this.renderTargetBlurBuffer1.dispose();
		this.renderTargetBlurBuffer2.dispose();
		this.renderTargetEdgeBuffer1.dispose();
		this.renderTargetEdgeBuffer2.dispose();
	},

	setSize: function ( width, height ) {

		this.renderTargetMaskBuffer.setSize(width, height );

		var resx = Math.round(width/2);
		var resy = Math.round(height/2);
		this.renderTargetMaskDownSampleBuffer.setSize(resx, resy );
		this.renderTargetBlurBuffer1.setSize(resx, resy );
		this.renderTargetEdgeBuffer1.setSize(resx, resy );

	  resx = Math.round(resx/2);
	  resy = Math.round(resy/2);

		this.renderTargetBlurBuffer2.setSize(resx, resy );
		this.renderTargetEdgeBuffer2.setSize(resx, resy );
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

	render: function ( renderer, writeBuffer, readBuffer, delta, maskActive ) {

		if(this.selectedObjects.length === 0 )
			return;

		this.oldClearColor.copy( renderer.getClearColor() );
		this.oldClearAlpha = renderer.getClearAlpha();
		var oldAutoClear = renderer.autoClear;
		renderer.autoClear = false;

		renderer.setClearColor( new THREE.Color( 0, 0, 0 ), 0 );

		if ( maskActive ) renderer.context.disable( renderer.context.STENCIL_TEST );

		// Make non selected objects invisible
		this.changeVisibilityOfNonSelectedObjects(false);

		// 1. Draw Selected objects in a Mask buffer
		this.renderScene.overrideMaterial = this.maskBufferMaterial;
		renderer.render( this.renderScene, this.renderCamera, this.renderTargetMaskBuffer, true );
		this.renderScene.overrideMaterial = null;

		// Make non selected objects visible
		this.changeVisibilityOfNonSelectedObjects(true);

		// 2. Downsample to Half resolution
		this.quad.material = this.materialCopy;
		this.copyUniforms[ "tDiffuse" ].value = this.renderTargetMaskBuffer.texture;
		renderer.render( this.scene, this.camera, this.renderTargetMaskDownSampleBuffer, true );

		// 3. Apply Edge Detection Pass
		this.quad.material = this.edgeDetectionMaterial;
		this.edgeDetectionMaterial.uniforms[ "maskTexture" ].value = this.renderTargetMaskDownSampleBuffer.texture;
		this.edgeDetectionMaterial.uniforms[ "texSize" ].value = new THREE.Vector2(this.renderTargetMaskDownSampleBuffer.width, this.renderTargetMaskDownSampleBuffer.height);
		this.edgeDetectionMaterial.uniforms[ "edgeThickness" ].value = this.edgeThickness;
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

		this.tempPulseColor.copy( this.edgeColor );
		if( this.pulsePeriod > 0 ) {
			this.tempPulseColor.multiplyScalar( 0.25 + Math.cos( ( performance.now() * 0.01 ) / this.pulsePeriod ) * 0.25 );
		}

		// Blend it additively over the input texture
		this.quad.material = this.overlayMaterial;
		this.overlayMaterial.uniforms[ "maskTexture" ].value = this.renderTargetMaskBuffer.texture;
		this.overlayMaterial.uniforms[ "edgeTexture1" ].value = this.renderTargetEdgeBuffer1.texture;
		this.overlayMaterial.uniforms[ "edgeTexture2" ].value = this.renderTargetEdgeBuffer2.texture;
		this.overlayMaterial.uniforms[ "edgeColor" ].value = this.tempPulseColor;		
		this.overlayMaterial.uniforms[ "edgeStrength" ].value = this.edgeStrength;

		if ( maskActive ) renderer.context.enable( renderer.context.STENCIL_TEST );

		renderer.render( this.scene, this.camera, readBuffer, false );

		renderer.setClearColor( this.oldClearColor, this.oldClearAlpha );
		renderer.autoClear = oldAutoClear;
	},

	getEdgeDetectionMaterial: function() {

		return new THREE.ShaderMaterial( {

			uniforms: {
				"maskTexture": { value: null },
				"texSize": 				{ value: new THREE.Vector2( 0.5, 0.5 ) },
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
				\
				void main() {\n\
					vec2 invSize = 1.0 / texSize;\
					vec2 uvOffset = vec2(1.0, 0.0) * invSize * edgeThickness;\
					float c1 = texture2D( maskTexture, vUv + uvOffset.xy).r;\
					float c2 = texture2D( maskTexture, vUv - uvOffset.xy).r;\
					float c3 = texture2D( maskTexture, vUv + uvOffset.yx).r;\
					float c4 = texture2D( maskTexture, vUv - uvOffset.yx).r;\
					float diff1 = (c2 - c1)*0.5;\
					float diff2 = (c4 - c3)*0.5;\
					float d = sqrt( diff1 * diff1 + diff2 * diff2);\
					gl_FragColor = vec4(d);\
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
				"texSize": 				{ value: new THREE.Vector2( 0.5, 0.5 ) },
				"direction": 				{ value: new THREE.Vector2( 0.5, 0.5 ) },
			},

			vertexShader:
				"varying vec2 vUv;\n\
				void main() {\n\
					vUv = uv;\n\
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n\
				}",

			fragmentShader:
				"#include <common>\
				varying vec2 vUv;\n\
				uniform sampler2D colorTexture;\n\
				uniform vec2 texSize;\
				uniform vec2 direction;\
				\
				float gaussianPdf(in float x, in float sigma) {\
					return 0.39894 * exp( -0.5 * x * x/( sigma * sigma))/sigma;\
				}\
				void main() {\n\
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
					gl_FragColor = vec4(diffuseSum/weightSum, 1.0);\n\
				}"
		} );
	},

	getOverlayMaterial: function() {

		return new THREE.ShaderMaterial( {

			uniforms: {
				"maskTexture": { value: null },
				"edgeTexture1": { value: null },
				"edgeTexture2": { value: null },
				"edgeColor": { value: null },
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
				uniform vec3 edgeColor;\
				uniform float edgeStrength;\
				\
				void main() {\
					vec4 edgeValue1 = texture2D(edgeTexture1, vUv);\
					vec4 edgeValue2 = texture2D(edgeTexture2, vUv);\
					vec4 maskColor = texture2D(maskTexture, vUv);\
					gl_FragColor = edgeStrength * vec4(edgeColor, 1.0) * ( edgeValue1 + edgeValue2) * (1.0 - maskColor.r);\
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
