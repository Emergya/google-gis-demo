self.checkGeoFilters = function(feature) {
	// If we are intersecting results, the default value is true, as we must "prove" that
	// that at least one filter doesn't match it to keep the result out; if we are uniting,
	// the default value is false as we must prove that a least one filter includes the result.
	var finalResult = self.filterIntersectionMode


	// We apply all filters instead of performing a lazy evaluation (which would be more efficient)
	// as we want to calculate, for each tool, the number of features that match each specific filter.
	for (var toolFilterKey in self.geometryFilters) {
		var toolFilter = self.geometryFilters[toolFilterKey];
		var result = self.checkToolFilter(feature, toolFilter.geometries);

		// We only count the feature as matched by the tool's filter if it must
		// be included and the filter included geometries (no it's not a match by default)
		if (result && toolFilter.geometries.length) {
			toolFilter.featuresMatching++;
		}

		if (self.filterIntersectionMode) {
			finalResult = finalResult && result;
		} else if (toolFilter.geometries.length) {
			// If we are uniting features, we don't wanna add all features if 
			// a tool doesn't provide geometries.
			finalResult = finalResult || result;
		}
	}

	return finalResult;
};

self.checkToolFilter = function(feature, geometries) {

	if (!geometries.length) {
		return true;
	}

	return true;

	// var latLng = new google.maps.LatLng(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
	// for (var i = 0; i < geometries.length; i++) {
	// 	if (!geometries[i]) {
	// 		continue;
	// 	}

	// 	var g = geometries[i];

	// 	// We handle multipolygons with recursion.
	// 	if (angular.isArray(g)) {
	// 		if (self.checkToolFilter(feature, g)) {
	// 			return true;
	// 		}
	// 	} else if (g.radius) {
	// 		// A circle
	// 		if (google.maps.geometry.spherical.computeDistanceBetween(feature.marker.position, g.center) < g.radius) {
	// 			return true;
	// 		}

	// 	} else if (google.maps.geometry.poly.containsLocation(latLng, g)) {
	// 		// A polygon
	// 		return true;
	// 	}
	// }

	return false;
};

self.debug = function(object) {
	self.postMessage({
		type: "debug",
		payload: object
	})
};

self.time = function(identifier) {
	self.postMessage({
		type: "time",
		identifier: identifier
	})
};


self.timeEnd = function(identifier) {
	self.postMessage({
		type: "timeEnd",
		identifier: identifier
	})
};



self.addEventListener("message", function(e) {
	self.time("applyGeoFilters");
	var toolFilter, toolFilterKey;
	
	var data = JSON.parse(e.data);
	self.debug(data.results.length);

	self.results = data.results;
	self.filterIntersectionMode = data.filterIntersectionMode;
	self.geometyFilters = data.geometryFilters;

	// We initialize the carets of the tools.
	for (toolFilterKey in self.geometryFilters) {
		toolFilter = self.geometryFilters[toolFilterKey];
		toolFilter.featuresMatching = 0;
	}

	var filtered = [];
	for (var i = 0; i < self.results.length; i++) {
		var result = self.results[i];

		if (self.checkGeoFilters(result)) {
			filtered.push(result);
		}
	}

	for (toolFilterKey in self.geometryFilters) {
		toolFilter = self.geometryFilters[toolFilterKey];
		toolFilter.hasResults = toolFilter.featuresMatching > 0;
	}

	

	self.timeEnd("applyGeoFilters");

	self.postMessage({
		type: "finished",
		filteredResults : filtered,
		geometryFilters: self.geometryFilters
	});
});