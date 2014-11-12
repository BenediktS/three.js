/**
 * On the internet site http://devblogs.nvidia.com/parallelforall/thinking-parallel-part-iii-tree-construction-gpu/
 * Tero Karras explains how to create a Linear Bounding Volume Hirarchie with a GPU.
 * He first explains how to do it the normal way and then how to do it much faster in 
 * a parallel GPU world. 
 * 
 * I just took the first part to create a BVHTree-manager that only could create a new tree.   
 * If the object changes, you have to recreate the hole tree.
 * 
 * 
 * Example use:
 * 
 * 
 * meshObject.BVHTree = THREE.LBVHManager.createTree(meshObject);
 * 
 * 
 * 
 */

THREE.LBVHManager = {



	// Calculate a 30-bit Morton Code for the
	// given 3D point located within the unit cube [ 0, 1 ].
	createMorton3Dcode : function() {
		'use strict';
		
		var xx, yy, zz,
		
		// Expands a 10-bit integer into a 30 bits
		// by inserting 2 zeros after each bit. 
	    expandBits = function( value ) {
	    	
			value = Math.floor(value);
			value = (value * 0x00010001) & 0xFF0000FF;
			value = (value * 0x00000101) & 0x0F00F00F;
			value = (value * 0x00000011) & 0xC30C30C3;
			value = (value * 0x00000005) & 0x49249249;
			return value;
			
		};	
			
		return function( x, y, z) {
		
			x = Math.min( Math.max( x * 1024, 0 ), 1023 );
			y = Math.min( Math.max( y * 1024, 0 ), 1023 );
			z = Math.min( Math.max( z * 1024, 0 ), 1023 );
			
			xx = expandBits( x );
			yy = expandBits( y );
			zz = expandBits( z );
			
			return xx * 4 + yy * 2 + zz;
			
		};
		
	}(),
	
	
	findSplit : function () {
		'use strict';
		
		var clz = function (value) {
			
				return 32 - value.toString(2).length;
				
			},		
			
			firstCode,
		    lastCode,
		    commonPrefix,
		    splitPrefix,
		    split,
		    step,
		    newSplit; 
		 
		return function(sortedMortonCodes, first, last ) { 
			
			firstCode = sortedMortonCodes[first].mortenCode;
		    lastCode  = sortedMortonCodes[last].mortenCode;
		 
			if (firstCode === lastCode) { 
				
				return (first + last) >> 1 ;  // bitwise "div 2" results in a integer. 
				
			}
			
			commonPrefix = clz(firstCode ^ lastCode);
			 
			split = first ;
			step = last - first;
			
			do {
				
				step = ( step + 1 ) >> 1; // exponential decrease. (bitwise "div 2" results in a integer.)
				newSplit = split + step;  // proposed new position
				
				if ( newSplit < last ) {
					
					splitPrefix = clz( firstCode -  sortedMortonCodes[newSplit].mortenCode);			
					if (splitPrefix > commonPrefix) { split = newSplit; }
					
				}	
				
			}		
			while ( step > 1 );
			
			return split;
			
		};
		
	}(),
	
	
	createHirarchy : function ( sortedMortonCodes, first, last ) {
		'use strict';
		
		var split, childA, childB, resultNode;

		// single object --> return leaf node	
		if (first === last) { 
			
				resultNode = new THREE.BVH.FaceLeaf(); 
				
				resultNode.mesh = sortedMortonCodes[first].mesh;
				resultNode.faceIndex = sortedMortonCodes[first].faceIndex;
				resultNode.bufferGeometryIndexOffset = (sortedMortonCodes[first].bufferGeometryIndexOffset !== 'undefined' ? sortedMortonCodes[first].bufferGeometryIndexOffset : 0);
	
				resultNode.boundingBox = new THREE.Box3();
				resultNode.boundingBox.expandByPoint(sortedMortonCodes[first].vA);
				resultNode.boundingBox.expandByPoint(sortedMortonCodes[first].vB);
				resultNode.boundingBox.expandByPoint(sortedMortonCodes[first].vC);
				
				return resultNode;
				
			}
		
		// Determine where to split the range
		split = this.findSplit( sortedMortonCodes, first, last );
		
		// Process the resulting sub-ranges recursively
		childA = this.createHirarchy( sortedMortonCodes, first, split );
		childB = this.createHirarchy( sortedMortonCodes, split + 1, last ); 
		
		resultNode = new THREE.BVH.TreeNode();	
		resultNode.childNodes.push( childA );
		resultNode.childNodes.push( childB );
			
		resultNode.boundingBox = new THREE.Box3();
		resultNode.boundingBox.expandByPoint( childA.boundingBox.min );
		resultNode.boundingBox.expandByPoint( childA.boundingBox.max );
		resultNode.boundingBox.expandByPoint( childB.boundingBox.min );
		resultNode.boundingBox.expandByPoint( childB.boundingBox.max );
		
		return resultNode;
		
	},
	
	
	
	createTree : function(){
		'use strict';
		
		var vA = new THREE.Vector3();
		var vB = new THREE.Vector3();
		var vC = new THREE.Vector3();
	
		var geometrySize = new THREE.Vector3(); 
		var centerX, centerY, centerZ;
		
		
		// For each triangle try to calculate a MortonCode.
		// We save the FaceIndex and for later use in the bonding volume the 
		// VA, VB and VC coordinate.
		return function(mesh) {
	
			var sortedMortonCodes = [];
			var geometry = mesh.geometry;
			
			if ( geometry.boundingBox === null ) geometry.computeBoundingBox();
	 		geometry.boundingBox.size(geometrySize); 
			
	
			if ( geometry instanceof THREE.BufferGeometry ) {
	
				var attributes = geometry.attributes;
				var a, b, c;
	
				if ( attributes.index !== undefined ) {
	
					var indices = attributes.index.array;
					var positions = attributes.position.array;
					var offsets = geometry.offsets;
	
					if ( offsets.length === 0 ) {
	
						offsets = [ { start: 0, count: indices.length, index: 0 } ];
	
					}
	
					for ( var oi = 0, ol = offsets.length; oi < ol; ++oi ) {
	
						var start = offsets[ oi ].start;
						var count = offsets[ oi ].count;
						var index = offsets[ oi ].index;
	
						for ( var i = start, il = start + count; i < il; i += 3 ) {
	
							a = ( index + indices[ i ] ) * 3;
							b = ( index + indices[ i + 1 ] ) * 3;
							c = ( index + indices[ i + 2 ] ) * 3;
	
							vA.fromArray( positions, a );
							vB.fromArray( positions, b );
							vC.fromArray( positions, c );
	
							// calc triangle bounding box center
							centerX = ( Math.min( vA.x, vB.x, vC.x ) + Math.max( vA.x, vB.x, vC.x ) ) / 2; 
							centerY = ( Math.min( vA.y, vB.y, vC.y ) + Math.max( vA.y, vB.y, vC.y ) ) / 2; 
							centerZ = ( Math.min( vA.z, vB.z, vC.z ) + Math.max( vA.z, vB.z, vC.z ) ) / 2;
							
							// put this center to range 0 to 1 of the geometry bounding box.
							centerX = ( centerX - geometry.boundingBox.min.x ) / geometrySize.x ;
							centerY = ( centerY - geometry.boundingBox.min.y ) / geometrySize.y ;
							centerZ = ( centerZ - geometry.boundingBox.min.z ) / geometrySize.z ;
							
							// input data.
							sortedMortonCodes.push( { mortonCode : this.createMorton3Dcode(centerX, centerY, centerZ), mesh : mesh, faceIndex : i/3, bufferGeometryIndexOffset : 0, vA : new THREE.Vector3().copy(vA), vB : new THREE.Vector3().copy(vB), vC : new THREE.Vector3().copy(vC)} );
						}
	
					}
	
				} else {
	
					var positions = attributes.position.array;
	
					for ( var i = 0, j = 0, jl = positions.length; j < jl; i += 1, j += 9 ) {
	
						vA.fromArray( positions, j );
						vB.fromArray( positions, j + 3 );
						vC.fromArray( positions, j + 6 );
	
						// calc triangle bounding box center
						centerX = ( Math.min( vA.x, vB.x, vC.x ) + Math.max( vA.x, vB.x, vC.x ) ) / 2; 
						centerY = ( Math.min( vA.y, vB.y, vC.y ) + Math.max( vA.y, vB.y, vC.y ) ) / 2; 
						centerZ = ( Math.min( vA.z, vB.z, vC.z ) + Math.max( vA.z, vB.z, vC.z ) ) / 2;
						
						// put this center to range 0 to 1 of the geometry bounding box.
						centerX = ( centerX - geometry.boundingBox.min.x ) / geometrySize.x ;
						centerY = ( centerY - geometry.boundingBox.min.y ) / geometrySize.y ;
						centerZ = ( centerZ - geometry.boundingBox.min.z ) / geometrySize.z ;
	
						sortedMortonCodes.push( { mortonCode : this.createMorton3Dcode(centerX, centerY, centerZ), mesh : mesh, faceIndex: i, vA : new THREE.Vector3().copy(vA), vB : new THREE.Vector3().copy(vB), vC : new THREE.Vector3().copy(vC)} );
					}
	
				}
	
			} else if ( geometry instanceof THREE.Geometry ) {
	
				var vertices = geometry.vertices;
								
				for ( var f = 0, fl = geometry.faces.length; f < fl; f ++ ) {
	
					var face = geometry.faces[ f ];

					var isFaceMaterial = mesh.material instanceof THREE.MeshFaceMaterial;
					var objectMaterials = (isFaceMaterial === true ? mesh.material.materials : null);
					var material = (isFaceMaterial === true ? objectMaterials[ face.materialIndex ] : mesh.material);

	
					a = vertices[ face.a ];
					b = vertices[ face.b ];
					c = vertices[ face.c ];
	
					vA.set( 0, 0, 0 );
					vB.set( 0, 0, 0 );
					vC.set( 0, 0, 0 );
	
					if ( material.morphTargets === true ) {
	
						var morphTargets = geometry.morphTargets;
						var morphInfluences = mesh.morphTargetInfluences;
	
						for ( var t = 0, tl = morphTargets.length; t < tl; t ++ ) {
	
							var influence = morphInfluences[ t ];
	
							if ( influence === 0 ) continue;
	
							var targets = morphTargets[ t ].vertices;
	
							vA.x += ( targets[ face.a ].x - a.x ) * influence;
							vA.y += ( targets[ face.a ].y - a.y ) * influence;
							vA.z += ( targets[ face.a ].z - a.z ) * influence;
	
							vB.x += ( targets[ face.b ].x - b.x ) * influence;
							vB.y += ( targets[ face.b ].y - b.y ) * influence;
							vB.z += ( targets[ face.b ].z - b.z ) * influence;
	
							vC.x += ( targets[ face.c ].x - c.x ) * influence;
							vC.y += ( targets[ face.c ].y - c.y ) * influence;
							vC.z += ( targets[ face.c ].z - c.z ) * influence;
	
						}
	
	
					}
					
					vA.add( a );
					vB.add( b );
					vC.add( c );
	
					// calc triangle bounding box center
					centerX = ( Math.min( vA.x, vB.x, vC.x ) + Math.max( vA.x, vB.x, vC.x ) ) / 2; 
					centerY = ( Math.min( vA.y, vB.y, vC.y ) + Math.max( vA.y, vB.y, vC.y ) ) / 2; 
					centerZ = ( Math.min( vA.z, vB.z, vC.z ) + Math.max( vA.z, vB.z, vC.z ) ) / 2;
					
					// put this center to range 0 to 1 of the geometry bounding box.
					centerX = ( centerX - geometry.boundingBox.min.x ) / geometrySize.x ;
					centerY = ( centerY - geometry.boundingBox.min.y ) / geometrySize.y ;
					centerZ = ( centerZ - geometry.boundingBox.min.z ) / geometrySize.z ;
		
					sortedMortonCodes.push( { mortonCode : this.createMorton3Dcode(centerX, centerY, centerZ), mesh : mesh, faceIndex: f, vA : new THREE.Vector3().copy(vA), vB : new THREE.Vector3().copy(vB), vC : new THREE.Vector3().copy(vC)} );

				}	

			}
		
			// Now we have all faces and the MortonCodes.
			sortedMortonCodes.sort( function(a,b){ return a.mortonCode - b.mortonCode } );
		
			// create hirarchy and return it.
			return this.createHirarchy( sortedMortonCodes, 0, sortedMortonCodes.length - 1 );		
			
		};
			
		
	}()



};




