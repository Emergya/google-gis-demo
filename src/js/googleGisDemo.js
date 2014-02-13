var googleGisDemo = angular.module("googleGisDemo", ["scroll", "ui.bootstrap"]);

googleGisDemo.controller("AppCtrl", function($scope, $http, $filter) {
	$scope.googleAPIKey = "AIzaSyDVLxK6W-SOvjOhuhtmG5W9ot24uYrxH2w";

	$scope.showPanel = true;
	
	$scope.loading = false;
	
	/**
	 * The results as are received from the request api.
	 */
	$scope.results = [];
	$scope._markers = [];

	/**
	 * The results that comply with the geo filters.
	 */
	$scope.geoFilteredResults = [];

	/**
	 * The geometries used to filter the results.
	 */
	$scope.geometryFilters ={};
	$scope.geometryFilterCount = 0;

	$scope.selectedResult = null;
	$scope.propertiesUrl = 'https://www.googleapis.com/mapsengine/v1/tables/17054336369362646689-14495543923251622067/features';
	$scope.nextPageToken = null;

	$scope.filterIntersectionMode = true;
	
	$scope.filterCombinationModes = [
		{
			label: "Match all",
			intersection: true
		}, {
			label: "Match any",
			intersection: false
		}
	];
	
	$scope.maxClusterZoom = 14;

	$scope.statusLabels = {
		for_sale: "For Sale",
		for_rent: "For Rent"
	};

	var mapOptions = {
		zoom: 12,
		center: new google.maps.LatLng(51.874722, -0.368333),
		mapTypeId: google.maps.MapTypeId.ROADMAP
	};
	$scope.map = new google.maps.Map(document.getElementById("map"), mapOptions);
	$scope.cluster = new MarkerClusterer($scope.map,[],{
		maxZoom: $scope.maxClusterZoom
	});

	/**
	 * Watches for changes in the filters (done by the filter tool controllers)
 	 * add apply the filters on the results.
 	 */ 
	$scope.$watch("geometryFilters", function() {
		$scope.applyGeoFilters();
	});


	$scope.applyGeoFilters = function() {
		var filtered = [];

		// We initialize the carets of the tools.
		for(var toolFilterKey in $scope.geometryFilters) {			
			var toolFilter = $scope.geometryFilters[toolFilterKey];
			toolFilter.featuresMatching = 0;
		}


		angular.forEach($scope.results, function(result) {
			if($scope.checkGeoFilters(result)) {
				filtered.push(result);
			}
		});

		for(var toolFilterKey in $scope.geometryFilters) {			
			var toolFilter = $scope.geometryFilters[toolFilterKey];
			toolFilter.hasResults = toolFilter.featuresMatching>0;
		}


		$scope.geoFilteredResults = filtered;		
	};
	
	/**
	 * Clears all filters. 
	 */
	$scope.clearAllToolFilters = function () {
		for(var filterToolId in $scope.geometryFilters) {
			var filterTool = $scope.geometryFilters[filterToolId];
			
			filterTool.clear();
		}
	};

	$scope.checkGeoFilters = function(feature) {
		// If we are intersecting results, the default value is true, as we must "prove" that
		// that at least one filter doesn't match it to keep the result out; if we are uniting,
		// the default value is false as we must prove that a least one filter includes the result.
		var finalResult = $scope.filterIntersectionMode
		
		
		// We apply all filters instead of performing a lazy evaluation (which would be more efficient)
		// as we want to calculate, for each tool, the number of features that match each specific filter.
		for(var toolFilterKey in $scope.geometryFilters) {
			var toolFilter = $scope.geometryFilters[toolFilterKey];
			var result = $scope.checkToolFilter(feature, toolFilter.geometries);

			// We only count the feature as matched by the tool's filter if it must
			// be included and the filter included geometries (no it's not a match by default)
			if(result && toolFilter.geometries.length) {
				toolFilter.featuresMatching++;
			}
			
			if($scope.filterIntersectionMode) {
				finalResult = finalResult && result;
			} else if(toolFilter.geometries.length) {
				// If we are uniting features, we don't wanna add all features if 
				// a tool doesn't provide geometries.
				finalResult = finalResult || result;
			}
		}

		return finalResult;
	};

	$scope.checkToolFilter = function(feature, geometries) {
		
		if(!geometries.length) {
			return true;
		}

		var latLng = new google.maps.LatLng(feature.geometry.coordinates[1],feature.geometry.coordinates[0]);
		for(var i = 0; i < geometries.length; i++) {
			if(!geometries[i]) {
				continue;
			}
			
			var g = geometries[i];
			
			// We handle multipolygons with recursion.
			if(angular.isArray(g)) {
				if($scope.checkToolFilter(feature, g)) {
					return true;				
				}
			} else if (g.radius) {
				// A circle
				if(google.maps.geometry.spherical.computeDistanceBetween(feature.marker.position, g.center) < g.radius) {
					return true;
				}				
				
			} else if(google.maps.geometry.poly.containsLocation(latLng, g)) {
				// A polygon
				return true;
			}
		}
		
		return false;
	};

	/**
	 * Adds an entry in the geometyFilter watched array for a tool so it can add geometries for use
	 * for filtering.
	 */ 
	$scope.registerGeometryFilter = function(filterToolId, clearCallback) {
		var toolFilter = {
			geometries: [], 
			featuresMatching:0,
			hasResults: false
		};

		$scope.geometryFilters[filterToolId] = toolFilter;


		toolFilter.add = function(feature) {
			if(!angular.isArray(feature)) {
				feature = [feature];
			}
		
			for(var i=0; i<feature.length; i++) {
				toolFilter.geometries.push(feature[i]);
				$scope.geometryFilterCount++;
			}
			
			$scope.applyGeoFilters();				
		};

		toolFilter.update = function(feature) {
			toolFilter.remove(feature);
			toolFilter.add(feature);			
			$scope.applyGeoFilters();				
		};

		toolFilter.remove = function(feature) {
			if(!angular.isArray(feature)) {
				feature = [feature];
			}
			
			for(var i=0; i < feature.length; i++) {
				var index = toolFilter.geometries.indexOf(feature[i]);
				toolFilter.geometries.splice(index,1);		
				$scope.geometryFilterCount--;
			}
			
			$scope.applyGeoFilters();				
		};

		toolFilter.clear = function() {
			clearCallback();
			
			
			toolFilter.geometries.splice(0, toolFilter.geometries.length);					
			$scope.applyGeoFilters();	
			$scope.geometryFilterCount=0;
		};

		return toolFilter;
	};

	$scope.$watchCollection("geoFilteredResults", function() {
		$scope.addMarkersToMap();
	});
	
	/**
	 * This function intercepts the filtered results and create markers form them.
	 */
	$scope.addMarkersToMap = function() {
		
		
		if($scope._markers) {
			$scope.cluster.clearMarkers();
		}
		
		$scope._markers = [];
		
		angular.forEach($scope.geoFilteredResults, function(result) {
			var marker = new google.maps.Marker({
				position: {
					lat: result.geometry.coordinates[1],
					lng: result.geometry.coordinates[0]
				},
				title: result.properties.displayable_address,				
				icon: {					
					url: "glyphicons/png/glyphicons_003_user.png",
					scaledSize: new google.maps.Size(20,20),
					anchor: new google.maps.Point(10,10),
				}
			});


			marker.showInfoWindow = function() {
				/**if(!this.popup) {
					this.popup = new google.maps.InfoWindow({
						content: "hello"
					});							
				}
				this.popup.open($scope.map, this);*/
			};

			marker.addListener("click", function(event){
				marker.showInfoWindow();
			});

			marker.toggleBounce = function (active) {
				
				if (active) {
					this.setAnimation(google.maps.Animation.BOUNCE);
					var m = this;
					setTimeout(function() {
						m.toggleBounce(false);
					}, 2000);
				} else {
					this.setAnimation(null);
				}
			};
			
			$scope.cluster.addMarker(marker);
			
			$scope._markers.push(marker);
			result.marker = marker;
		});
	};

	$scope.resultClicked = function(result) {
		// The current result is deselected.
		if ($scope.selectedResult) {
			$scope.selectedResult.active = false;
			
			$scope.selectedResult.marker.toggleBounce(false);
			if ($scope.selectedResult.marker.popup) {
				$scope.selectedResult.marker.popup.close();
				
			}
		}

		// We set the current selected result and highlight it.
		$scope.selectedResult = result;
		
		result.marker.toggleBounce(true);
		result.active = true;
		result.marker.showInfoWindow();

		$scope.map.panTo(result.marker.position);
		
		if($scope.map.getZoom() <= $scope.maxClusterZoom) {
			$scope.map.setZoom($scope.maxClusterZoom +1);		
		}
	};

	$scope.loadNextPage = function() {
		$scope.doRequest();
	};

	$scope.doRequest = function() {
		
		$scope.loading = true;
		
		var params = {
			key: $scope.googleAPIKey,
			version: "published",
			maxResults: 1000,
			limit: 2000
			//orderBy: "price DESC",
			//select: "geometry, displayable_address, agent_phone, price",
			//where: "price>10" // This doesn't seem to work.
		};

		if ($scope.nextPageToken) {
			params["pageToken"] = $scope.nextPageToken;
		}

		$http({
			method: 'GET',
			url: $scope.propertiesUrl,
			params: params
		})
			.success(function(data, status, header, config) {
				
				$scope.loading = false;
				
				if (data.nextPageToken &&  data.nextPageToken!=$scope.nextPageToken) {
					$scope.nextPageToken = data.nextPageToken;
				} else {
					$scope.nextPageToken = null;
				}

				angular.forEach(data.features, function(feature) {
					if(feature.geometry) {
						$scope.results.push({
							geometry: feature.geometry,
							properties: feature.properties,
							id: feature.properties.listing_id
						});	
					}
					
				});

				$scope.applyGeoFilters();
			})
			.error(function(data, status, headers, errors) {
				$scope.loading = false;
				//alert("error!");
				console.log(data);
			});
	};

	$scope.filter = function(result) {
		return result.properties.price > 0;
	};

	$(document).ready(function() {
		$scope.doRequest(1);
	});

});