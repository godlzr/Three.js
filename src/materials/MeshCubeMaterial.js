import { Material } from './Material';

/**
 * @author bhouston / https://clara.io
 *
 * parameters = {
 *
 * }
 */

function MeshCubeMaterial = function ( parameters ) {

	Material.call( this );

	this.type = 'MeshCubeMaterial';

	this.envMap = null;
	this.envMapIntensity = 1.0;

	this.roughness = 0.0;

	this.depthTest = false;
	this.depthWrite = false;
	this.side = THREE.BackSide;

	this.lights = false;

	this.setValues( parameters );

};

MeshCubeMaterial.prototype = Object.create( Material.prototype );
MeshCubeMaterial.prototype.constructor = MeshCubeMaterial;

MeshCubeMaterial.prototype.isMeshCubeMaterial = true;

MeshCubeMaterial.prototype.copy = function ( source ) {

	Material.prototype.copy.call( this, source );

	this.envMap = source.envMap;
	this.envMapIntensity = source.envMapIntensity;

	this.roughness = source.roughness;

	return this;

};
