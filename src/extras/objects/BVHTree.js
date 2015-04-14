/**
 *
 * BVH-Objects are only the Nodes and Leafs of a BVHTree.
 * 
 * They only have the raycasting function and the data information of Nodes and Leafs.
 * All other functions to create and manage the tree must be put in the different BVHTree-Managers.
 *  
 */

THREE.BVH = {};


THREE.BVH.TreeNode = function ( parentNode ) { 
		'use strict';
	
		this.parentNode = (parentNode !== undefined ? parentNode : null);
		this.childNodes	= [];
		
		this.boundingBox		= null;
		this.boundingSphere		= null;
			
};

THREE.BVH.TreeNode.prototype = {
	
	constructor	: THREE.BVHTreeNode,

	intersectsRay : function ( ray, precision, near, far, intersects ) {		
		'use strict';
		
		var hit, i, l;
		
		// test if the ray hits our node.
		if (this.boundingBox) {
			
			hit = ray.isIntersectionBox( this.boundingBox ); 

		} else if (this.boundingSphere) {
			
			hit = ray.isIntersectionSphere( this.boundingSphere ) ;
			
		} else {	
					
			throw('Bounding volume is not set or not yet supported from the intersectRay function.');
			
		}
		
		
		// if the ray hits the bounding volume we ned to test the child nodes. 
		if (hit) {
			
			for (i = 0, l = this.childNodes.length; i < l; i+=1) {

				this.childNodes[i].intersectsRay( ray, precision, near, far, intersects );

			}

		}

	}
		
};


THREE.BVH.FaceLeaf = function(parentNode) {
	'use strict';
	
	this.parentNode = (parentNode !== undefined ? parentNode : null);
	
	this.mesh		= null;
	this.faceIndex	= null;
	this.bufferGeometryIndexOffset = 0;	

	this.boundingSphere		= null;
	this.boundingBox		= null;		
};

THREE.BVH.FaceLeaf.prototype = {
	
	constructor	: THREE.BVHTreeLeaf_Face,
	
	// Test if the ray hit the face.
	intersectsRay : function ( ray, precision, near, far, intersects ) {
		
		this.mesh.rayIntersectsFace(this.faceIndex, this.bufferGeometryIndexOffset, ray, precision, near, far,  intersects)
				
	}
	
};

