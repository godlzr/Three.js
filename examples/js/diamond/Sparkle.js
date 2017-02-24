/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
var vertexShaderSparkles =
        "varying vec2 vUv;\n\
         varying vec4 sparkleProjectedCentre;\n\
         uniform mat4 ModelViewMatrix;\n\
         uniform float scale;\n\
         uniform float rotation;\n\
         void main() {\n\
              vUv = uv;\n\
              vec4 finalPosition;\n\
              vec2 alignedPosition = position.xy * scale;\n\
              vec2 rotatedPosition;\n\
              rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;\n\
              rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;\n\
              finalPosition = ModelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );\n\
              finalPosition.xy += rotatedPosition;\n\
              finalPosition = projectionMatrix * finalPosition;\n\
              sparkleProjectedCentre = projectionMatrix * ModelViewMatrix * vec4(0.0,0.0,0.0,1.0 );\n\
              gl_Position = finalPosition;\n\
         }";
        var fragmentShaderSparkles = "varying vec2 vUv;\n\
             varying vec4 sparkleProjectedCentre;\n\
             uniform sampler2D sparkleTexture;\n\
             uniform sampler2D screenTexture;\n\
             uniform sampler2D noiseTexture;\n\
             uniform float intensity;\n\
             \n\
             vec3 ClosestPrimaryColor(vec3 color) {\n\
                  vec3 diffColor1 = vec3(1.0,0.0,0.0) - color;\n\
                  vec3 diffColor2 = vec3(0.0,1.0,0.0) - color;\n\
                  vec3 diffColor3 = vec3(0.0,0.0,1.0) - color;\n\
                  const float margin = 0.5;\n\
                  if(dot(diffColor1, diffColor1) < margin)\n\
                      return vec3(1.0, margin, margin);\n\
                  if(dot(diffColor2, diffColor2) < margin)\n\
                      return vec3(margin, 1.0, margin);\n\
                  if(dot(diffColor3, diffColor3) < margin)\n\
                      return vec3(margin, margin, 1.0);\n\
                  return color;\n\
             }\n\
             \n\
             void main() {\n\
                  vec2 uv = (sparkleProjectedCentre.xy/sparkleProjectedCentre.w + 1.0)*0.5;\n\
                  vec4 screenColor = texture2D( screenTexture, uv );\n\
                  //screenColor.rgb = ClosestPrimaryColor(screenColor.rgb);\n\
                  float noise = texture2D( noiseTexture, uv ).r;\n\
                  screenColor.xyz *= screenColor.xyz;\n\
                  screenColor.xyz *= screenColor.xyz;\n\
                  screenColor.xyz *= screenColor.xyz;\n\
                  //float luminance = dot(vec3(0.3, 0.59, 0.11), screenColor.xyz);\n\
                  //luminance = luminance > 0.0 ? luminance : 0.0;\n\
                  vec4 spriteColor = texture2D( sparkleTexture, vUv ).a * screenColor * noise * intensity;\n\
                  gl_FragColor = spriteColor;//\n\
          }";

        var sparkleMaterialUniforms =  {
            "ModelViewMatrix": {type: "m4", value: new THREE.Matrix4().identity()},
            "sparkleTexture": {type: "t", value: null},
            "screenTexture": {type: "t", value: null},
            "noiseTexture": {type: "t", value: null},
            "scale": {type: "f", value: 1.0},
            "rotation": {type: "f", value: 0},
            "intensity": {type: "f", value: 1.0},
        };

        function Sparkle(sparkleTexture, noiseTexture) {
            this.texture = sparkleTexture;
            this.noiseTexture = noiseTexture;
            this.geometry = new THREE.PlaneGeometry(1, 1, 0);
            this.material = new THREE.ShaderMaterial();
            this.material.depthTest = false;
            this.material.depthWrite = false;
            this.material.transparent = true;
            this.material.side = THREE.DoubleSide;
            this.material.blending = THREE.AdditiveBlending;
            this.material.vertexShader = vertexShaderSparkles;
            this.material.fragmentShader = fragmentShaderSparkles;
            this.material.uniforms = THREE.UniformsUtils.clone(sparkleMaterialUniforms);
            if(this.texture !== undefined)
                this.material.uniforms["sparkleTexture"].value = sparkleTexture;
            if(this.noiseTexture !== undefined)
                this.material.uniforms["noiseTexture"].value = noiseTexture;

            this.mesh = new THREE.Mesh(this.geometry, this.material);
            this.mesh.positionOffset = new THREE.Vector3();
            this.rotationSpeedFactor = 5;
        }

        Sparkle.prototype = {
            constructor: Sparkle,

            shallowCopy: function() {
                var sparkle = new Sparkle(this.texture);
                sparkle.mesh.positionOffset = new THREE.Vector3();
                sparkle.mesh.positionOffset.copy(this.mesh.positionOffset);
                sparkle.material.uniforms["scale"].value = this.material.uniforms["scale"].value;
                sparkle.material.uniforms["rotation"].value = this.material.uniforms["rotation"].value;
                sparkle.material.uniforms["intensity"].value = this.material.uniforms["intensity"].value;
                sparkle.material.uniforms["screenTexture"].value = this.material.uniforms["screenTexture"].value;
                sparkle.material.uniforms["noiseTexture"].value = this.material.uniforms["noiseTexture"].value;
                sparkle.material.uniforms["ModelViewMatrix"].value.copy(this.material.uniforms["ModelViewMatrix"].value);
                sparkle.rotationSpeedFactor = this.rotationSpeedFactor;
                return sparkle;
            },

            setScale: function(scale) {
                this.material.uniforms["scale"].value = scale;
            },
            setIntensity: function(intensity) {
                this.material.uniforms["intensity"].value = intensity;
            },
            setRotation: function(rotation) {
                this.material.uniforms["rotation"].value = rotation;
            },
            setRotationSpeedFactor: function(rotationSpeedFactor) {
                this.rotationSpeedFactor = rotationSpeedFactor;
            },
            setPositionOffset: function(offsetx, offsety, offsetz) {
                this.mesh.positionOffset.x = offsetx;
                this.mesh.positionOffset.y = offsety;
                this.mesh.positionOffset.z = offsetz;
                this.mesh.position.copy(this.mesh.positionOffset);
                this.mesh.updateMatrix();
            },

            alignWithCamera: function(camera) {
                this.mesh.modelViewMatrix.multiplyMatrices( camera.matrixWorldInverse, this.mesh.matrix );
                var matrix = this.material.uniforms["ModelViewMatrix"].value;
                matrix.copy(this.mesh.modelViewMatrix);
            },

            syncWithTransform: function(transform) {
                this.mesh.position.copy(this.mesh.positionOffset);
                this.mesh.position.applyMatrix4(transform);
                this.mesh.updateMatrix();
            }
        };
