/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
        var DiamondShader = {};

        DiamondShader.fragmenShaderNormalMapCapture = "varying vec2 vUv;\
            varying vec3 Normal;\
            void main() {\
                vec3 color = normalize(Normal);\
                gl_FragColor = vec4( color.x, color.y, color.z, 1.0 );\
            }";

        DiamondShader.fragmenShaderDiamond = "#extension GL_OES_standard_derivatives : enable\
            precision highp float;\
            #define PI 3.141592653589793\n\
            #include <cube_uv_reflection_fragment>\
            varying vec2 vUv;\
            varying vec3 Normal;\
            varying vec3 worldNormal;\
            varying vec3 vecPos;\
            varying vec3 viewPos;\
            uniform samplerCube tCubeMapNormals;\
            uniform sampler2D IBLTexture;\
            uniform vec4 TextureCoordSetArray[8];\
            uniform float RoughnessArray[8];\
            uniform float tanAngleSqCone;\
            uniform float coneHeight;\
            uniform int maxBounces;\
            uniform mat4 ModelMatrix;\
            uniform mat4 InverseModelMatrix;\
            // Tweak params\n\
            uniform float n2;\
            uniform bool bIntersectSphere;\
            uniform bool bDebugBounces;\
            uniform float rIndexDelta;\
            uniform float normalOffset;\
            uniform float squashFactor;\
            uniform vec3 Absorbption;\
            // hdr params\n\
            uniform float YWhite;\
            uniform float LogAvgLum;\
            uniform float Key;\
            uniform float Saturation;\
            \
            float SchlickApproxFresenel(float a, float NdotV) {\
                float schlick = pow(1.0 - abs(NdotV), 5.0);\
                return a * ( 1.0 - schlick) + schlick;\
            }\
            \
            vec4 rgbToSrgb(vec4 rgbColor){\
                const float a = 0.055;\
                return (1.0 + a) * pow(rgbColor, vec4(0.5)) - a;\
            }\
            \
            vec3 convertRGBEToRGB(vec4 rgbe) {\
                float d = pow(2.0, rgbe.w*256.0 - 128.0);\
                return vec3(rgbe) * d;\
            }\
            \n\
            #define Uncharted2Helper( x ) max( ( ( x * ( 0.15 * x + 0.10 * 0.50 ) + 0.20 * 0.02 ) / ( x * ( 0.15 * x + 0.50 ) + 0.20 * 0.30 ) ) - 0.02 / 0.30, vec3( 0.0 ) )\n\
            vec3 tonemap(vec3 RGB) {\
               float white = YWhite*YWhite;\
               float Ylum = dot(RGB ,vec3(0.2126, 0.7152, 0.0722));\
               float Y = Key/LogAvgLum * Ylum ;\
               float Yd = Y * ( 1.0 + Y/white)/( 1.0 + Y) ;\
               return Yd * pow(RGB/Ylum ,vec3(Saturation));\
            }\
            \
            vec4 SampleSpecularContribution(vec4 specularColor, vec3 direction, float roughness) {\
                vec4 texCoordSetLowerSampler;\
                vec4 texCoordSetUpperSampler;\
                texCoordSetLowerSampler = TextureCoordSetArray[0];\
                texCoordSetUpperSampler = TextureCoordSetArray[1];\
                float phi_refl = atan(direction.z, direction.x);\
                phi_refl = phi_refl < 0.0 ? 2.0*PI + phi_refl : phi_refl;\
                phi_refl /= (2.0*PI);\
                float theta_refl = (asin(direction.y) + PI * 0.5)/PI;\
                theta_refl = theta_refl > 1.0 ? 1.0 : theta_refl;\
                vec2 texCoordLower = vec2(texCoordSetLowerSampler.x + phi_refl * texCoordSetLowerSampler.y, texCoordSetLowerSampler.z + theta_refl * texCoordSetLowerSampler.w);\
                vec4 rgbeLower = texture2D(IBLTexture, texCoordLower);\
                vec3 rgbLower = tonemap(specularColor.xyz*convertRGBEToRGB(rgbeLower));\
                return  vec4(rgbLower, 1.0);\
             }\
             \
             vec3 intersectCone(vec3 origin, vec3 direction) {\
                 float Ox = origin.x; float Oy = origin.y; float Oz = origin.z;\
                 float Dx = direction.x; float Dy = direction.y/squashFactor; float Dz = direction.z;\
                 float A = Dx*Dx + Dz*Dz - Dy*Dy*tanAngleSqCone;\
                 float B = 2.0*(Ox*Dx + Oz*Dz - Oy*Dy*tanAngleSqCone - Dy*coneHeight*tanAngleSqCone*0.5);\
                 float C = Ox*Ox + Oz*Oz - (Oy*Oy + coneHeight*coneHeight*0.25 + Oy*coneHeight)*tanAngleSqCone;\
                 float disc = B*B - 4.0*A*C;\
                 float eps = 1e-4;\
                 float t = -1.0;\
                 if(disc > eps) {\
                     disc = sqrt(disc);\
                     float t1 = (-B + disc)/A*0.5;\
                     float t2 = (-B - disc)/A*0.5;\
                     t = (t1 > t2) ? t1 : t2;\
                 }\
                 if(abs(disc) < eps)\
                     t = -B/A*0.5;\
                 float tplane = (coneHeight*0.5 - Oy)/Dy;\
                 t = t > tplane ? t : tplane;\
                 direction.y *= squashFactor;\
                 return vec3(origin + direction * t);\
             }\
             \
             vec3 intersectSphere(vec3 origin, vec3 direction) {\
                 direction.y /= squashFactor;\
                 float A = dot(direction, direction);\
                 float B = 2.0*dot(origin, direction);\
                 float C = dot(origin, origin) - 1.0;\
                 float disc = B*B - 4.0 * A * C;\
                 if(disc > 0.0) \
                 {\
                     disc = sqrt(disc);\
                     float t1 = (-B + disc)*0.5/A;\
                     float t2 = (-B - disc)*0.5/A;\
                     float t = (t1 > t2) ? t1 : t2;\
                     direction.y *= squashFactor;\
                     return vec3(origin + direction * t);\
                 }\
                 return vec3(0.0);\
             }\
             \
             vec3 debugBounces(int count) {\
                 vec3 color;\
                 if(count == 1)\
                     color = vec3(0.0,1.0,0.0);\
                 else if(count == 2)\
                     color = vec3(0.0,0.0,1.0);\
                 else if(count == 3)\
                     color = vec3(1.0,1.0,0.0);\
                 else if(count == 4)\
                     color = vec3(0.0,1.0,1.0);\
                 else\
                     color = vec3(0.0,0.0,0.0);\
                 if(count ==0)\
                     color = vec3(1.0,0.0,0.0);\
                 return color;\
             }\
             \
             vec3 traceRay(vec3 origin, vec3 direction, vec3 normal) {\
               vec3 outColor = vec3(0.0);\
               // Reflect/Refract ray entering the diamond\n\
               const float n1 = 1.0;\
               const float epsilon = 1e-4;\
               float f0 = (n2- n1)/(n2 + n1);\
               f0 *= f0;\
               vec3 attenuationFactor = vec3(1.0);\
               vec3 newDirection = refract(direction, normal, n1/n2);\
               vec3 reflectedDirection = reflect(direction, normal);\
               float fresenelReflected = SchlickApproxFresenel(f0, dot(normal, reflectedDirection));\
               float fresenelRefracted = SchlickApproxFresenel(f0, dot(-normal, newDirection));\
               attenuationFactor *= ( 1.0 - fresenelRefracted);\
               outColor += SampleSpecularContribution(vec4(1.0), reflectedDirection, 0.0).rgb * fresenelReflected;\
               const int iterCount = 6;\
               int count = 0;\
               newDirection = (InverseModelMatrix * vec4(newDirection, 0.0)).xyz;\
               newDirection = normalize(newDirection);\
               origin = (InverseModelMatrix * vec4(origin, 1.0)).xyz;\
               // bounce the ray inside the diamond\n\
               for( int i=0; i<iterCount; i++) {\
                  vec3 intersectedPos;\
                  if(bIntersectSphere)\
                    intersectedPos = intersectSphere(origin + vec3(epsilon), newDirection);\
                  else\
                    intersectedPos = intersectCone(origin + vec3(epsilon), newDirection);\
                  vec3 dist = intersectedPos - origin;\
                  vec3 d = normalize(intersectedPos);\
                  // Normal of the diamond\n\
                  vec3 mappedNormal = textureCube( tCubeMapNormals, d ).xyz;\
                  mappedNormal.y += normalOffset;\
                  mappedNormal = normalize(mappedNormal);\
                  float r = sqrt(dot(dist, dist));\
                   // refract the ray at intersection\n\
                  vec3 oldDir = newDirection;\
                  newDirection = refract(newDirection, mappedNormal, n2/n1);\
                  origin = intersectedPos;\
                  attenuationFactor *= exp(-r*Absorbption);\
                  if( dot(newDirection, newDirection) == 0.0) { // Total Internal Reflection. Continue inside the diamond\n\
                       newDirection = reflect(oldDir, mappedNormal);\
                       if(i == iterCount-1 ) //If the ray got trapped even after max iterations, simply sample along the outgoing refraction! \n\
                       {\
                          float f1 = SchlickApproxFresenel(f0, dot(mappedNormal, -oldDir));\
                          vec3 d1 = (ModelMatrix * vec4(oldDir, 0.0)).xyz;\
                          outColor += SampleSpecularContribution(vec4(1.0), d1, 0.0).rgb * attenuationFactor * (1.0 - f1);\
                       }\
                  } else { // Add the contribution from outgoing ray, and continue the reflected ray inside the diamond\n\
                      float fresnelRefractedRay = SchlickApproxFresenel(f0, dot(-mappedNormal, newDirection));\
                      // outgoing(refracted) ray's contribution \n\
                      vec3 d1 = (ModelMatrix * vec4(newDirection, 0.0)).xyz;\
                      vec3 colorG = SampleSpecularContribution(vec4(1.0), d1, 0.0).rgb * ( 1.0 - fresnelRefractedRay);\
                      vec3 dir1 = refract(oldDir, mappedNormal, (n2+rIndexDelta)/n1);\
                      vec3 dir2 = refract(oldDir, mappedNormal, (n2-rIndexDelta)/n1);\
                      vec3 d2 = (ModelMatrix * vec4(dir1, 0.0)).xyz;\
                      vec3 d3 = (ModelMatrix * vec4(dir2, 0.0)).xyz;\
                      vec3 colorR = SampleSpecularContribution(vec4(1.0), d2, 0.0).rgb * ( 1.0 - fresnelRefractedRay);\
                      vec3 colorB = SampleSpecularContribution(vec4(1.0), d3, 0.0).rgb * ( 1.0 - fresnelRefractedRay);\
                      outColor += vec3(colorR.r, colorG.g, colorB.b) * attenuationFactor;\
                      // new reflected ray inside the diamond\n\
                      newDirection = reflect(oldDir, mappedNormal);\
                      float fresnelReflectedRay = SchlickApproxFresenel(f0, dot(mappedNormal, newDirection));\
                      attenuationFactor *= fresnelReflectedRay;\
                      count++;\
                  }\
               }\
                 if(bDebugBounces)\
                    outColor = debugBounces(count);\
                 return outColor;\
             }\
             \
            void main() {\
                vec3 normalizedNormal = normalize(worldNormal);\
                vec3 viewVector = normalize(vecPos - cameraPosition);\
                vec3 color = traceRay(vecPos, viewVector, normalizedNormal);\
                gl_FragColor = vec4(color.rgb,0.50);\
            }";

        DiamondShader.vertexShader = "varying vec2 vUv;\
             varying vec3 Normal;\
             varying vec3 worldNormal;\
             varying vec3 vecPos;\
             varying vec3 viewPos;\
             void main() {\
                  vUv = uv;\
                  Normal =  normal;\
                  worldNormal = (modelMatrix * vec4(normal,0.0)).xyz;\
                  vecPos = (modelMatrix * vec4(position, 1.0 )).xyz;\
                  viewPos = (modelViewMatrix * vec4(position, 1.0 )).xyz;\
                  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\
             }";

        DiamondShader.material = new THREE.ShaderMaterial({
            defines:
            {
              'ENVMAP_TYPE_CUBE_UV' : ''
            },
            extensions: {
          		'derivatives': true
          	},
            uniforms: {
                "tCubeMapNormals": {type: "t", value: null},
                "IBLTexture": {type: "t", value: null},
                "TextureCoordSetArray": {type: 'v4v', value: null},
                "RoughnessArray": {type: 'fv1', value: null},
                "maxBounces": {type: 'i', value: 1},
                "tanAngleSqCone": {type: 'f', value: 0.0},
                "coneHeight": {type: 'f', value: 0.0},
                "bIntersectSphere": {type: 'i', value: true},
                "bDebugBounces": {type: 'i', value: false},
                "rIndexDelta": {type: 'f', value: 0.05},
                "n2": {type: 'f', value: 2.4},
                "normalOffset": {type: 'f', value: 0.10},
                "squashFactor": {type: 'f', value: 1.0},
                "YWhite": {type: 'f', value: 10},
                "LogAvgLum": {type: 'f', value: 0.08},
                "Key": {type: 'f', value: 1},
                "Saturation": {type: 'f', value: 0.45},
                "Absorbption": {type: 'v3', value: new THREE.Vector3(0.0, 0.0, 0.0)},
                "ModelMatrix": {type: 'm4', value: new THREE.Matrix4().identity()},
                "InverseModelMatrix": {type: 'm4', value: new THREE.Matrix4().identity()}
            },
            vertexShader: DiamondShader.vertexShader,
            fragmentShader: DiamondShader.fragmenShaderDiamond
        });
        DiamondShader.material.side = THREE.DoubleSide;

        DiamondShader.normalMapCaptureMaterial = new THREE.ShaderMaterial({
             vertexShader: DiamondShader.vertexShader,
             fragmentShader: DiamondShader.fragmenShaderNormalMapCapture
        });
        DiamondShader.normalMapCaptureMaterial.side = THREE.DoubleSide;

        var diamondLoader = new DiamondLoader();

        function Diamond(fileName, envTexture, readyCallback) {
            this.envTexture = envTexture;
            this.cubeCamera = new THREE.CubeCamera(0.01, 100, 1024);
            this.localScene = new THREE.Scene();
            this.localScene.add(this.cubeCamera);
            this.material = new THREE.ShaderMaterial();
            this.material.extensions = DiamondShader.material.extensions;
            this.material.defines = DiamondShader.material.defines;
            this.material.uniforms = THREE.UniformsUtils.clone( DiamondShader.material.uniforms );
            this.material.uniforms["IBLTexture"].value = this.envTexture;
            this.material.vertexShader = DiamondShader.material.vertexShader;
            this.material.fragmentShader = DiamondShader.material.fragmentShader;
            this.cubeCamera.renderTarget.generateMipmaps = false;
            this.cubeCamera.renderTarget.magFilter = THREE.NearestFilter;
            this.cubeCamera.renderTarget.minFilter = THREE.NearestFilter;
            this.cubeCamera.renderTarget.format = THREE.RGBAFormat;
            this.cubeCamera.renderTarget.type = THREE.FloatType;
            this.geometry = null;
            this.mesh = null;
            this.normalBakeHelperMesh = null;
            this.position = new THREE.Vector3();
            this.rotation = new THREE.Vector3();
            this.scale = new THREE.Vector3(1,1,1);
            var onObjectLoad = function (object)
            {
                this.mesh = object.children[0];
                this.normalBakeHelperMesh = this.mesh.clone();
                this.normalBakeHelperMesh.material = DiamondShader.normalMapCaptureMaterial;
                this.geometry = object.children[0].geometry;
                this.mesh.traverse(function (child) {
                if (child instanceof THREE.Mesh) {
                    child.geometry.center();
                    child.geometry.computeBoundingSphere();
                    var scale = 1/child.geometry.boundingSphere.radius;
                    var scaleMatrix = new THREE.Matrix4();
                    scaleMatrix.makeScale(scale, scale, scale);
                    child.geometry.applyMatrix(scaleMatrix);
                 }
                });
                this.localScene.add(this.normalBakeHelperMesh);
                readyCallback();
            };
            this.sparkles = [];
            if(fileName !== undefined)
                diamondLoader.load(fileName, onObjectLoad.bind(this));
        }

        Diamond.prototype = {
        constructor: Diamond,
        // Copies the diamond with the shared geometry. If you only need to translate/rotate/scale the diamond node, use this.
        shallowCopy: function() {
            var diamond = new Diamond();
            diamond.material = new THREE.ShaderMaterial();
            diamond.material.uniforms = THREE.UniformsUtils.clone( this.material.uniforms );
            diamond.material.uniforms["tCubeMapNormals"].value = this.cubeCamera.renderTarget;
            diamond.material.uniforms["IBLTexture"].value = this.envTexture;
            diamond.material.vertexShader = this.material.vertexShader;
            diamond.material.fragmentShader = this.material.fragmentShader;
            diamond.mesh = new THREE.Mesh(this.geometry, diamond.material);
            diamond.cubeCamera = this.cubeCamera;
            diamond.geometry = this.geometry;
            diamond.position.copy(this.position);
            diamond.rotation.copy(this.rotation);
            diamond.scale.copy(this.scale);
            for(var i=0; i<this.sparkles.length; i++) {
                diamond.sparkles.push(this.sparkles[i].shallowCopy());
            }
            return diamond;
        },

        setPosition: function(x, y, z) {
            this.position.set(x, y, z);
            this.mesh.position.x = x;
            this.mesh.position.y = y;
            this.mesh.position.z = z;
        },

        setRotation: function(x, y, z) {
            this.rotation.set(x, y, z);
            this.mesh.rotation.x = x;
            this.mesh.rotation.y = y;
            this.mesh.rotation.z = z;
        },

        setScale: function(x, y, z) {
            this.scale.set(x, y, z);
            this.mesh.scale.x = x;
            this.mesh.scale.y = y;
            this.mesh.scale.z = z;
            for(var i=0; i<this.sparkles.length; i++) {
                this.sparkles[i].setScale(x);
            }
        },

        applyTransform: function() {
            this.mesh.updateMatrixWorld();
            this.material.uniforms["ModelMatrix"].value.copy(this.mesh.matrixWorld);
            var m1 = this.material.uniforms["ModelMatrix"].value;
            var m2 = this.material.uniforms["InverseModelMatrix"].value;
            m2.getInverse(m1);
            for(var i=0; i<this.sparkles.length; i++) {
                this.sparkles[i].syncWithTransform(m1);
            }
        },

        prepareNormalsCubeMap: function(renderer) {
            this.cubeCamera.updateCubeMap(renderer, this.localScene);
            this.material.uniforms["tCubeMapNormals"].value = this.cubeCamera.renderTarget;
        },

        alignSparklesWithCamera: function(camera) {
            var v = new THREE.Vector3();
            for(var i=0; i<this.sparkles.length; i++) {
                v.copy(camera.position);
                v.sub(this.sparkles[i].mesh.position);
                v.normalize();
                var rot = v.x + v.y + v.z;
                this.sparkles[i].setRotation(rot*this.sparkles[i].rotationSpeedFactor);
                this.sparkles[i].alignWithCamera(camera);
            }
        },

        addSparkle: function(sparkle) {
            this.sparkles.push(sparkle);
        }
};
