declare namespace google.maps {
  class LatLng {
    lat(): number;
    lng(): number;
  }

  interface GeocoderAddressComponent {
    long_name: string;
    short_name: string;
    types: string[];
  }

  enum GeocoderStatus {
    OK = "OK",
    ZERO_RESULTS = "ZERO_RESULTS",
    OVER_QUERY_LIMIT = "OVER_QUERY_LIMIT",
    REQUEST_DENIED = "REQUEST_DENIED",
    INVALID_REQUEST = "INVALID_REQUEST",
    UNKNOWN_ERROR = "UNKNOWN_ERROR",
  }

  interface GeocoderResult {
    geometry?: { location?: LatLng };
  }

  class Geocoder {
    geocode(
      request: { address: string; componentRestrictions?: { country: string } },
      callback: (results: GeocoderResult[] | null, status: GeocoderStatus) => void
    ): void;
  }

  function importLibrary(library: "places"): Promise<unknown>;
  function importLibrary(library: string): Promise<unknown>;

  namespace places {
    class AutocompleteSessionToken {}

    interface PlacePrediction {
      placeId: string;
      text: { text: string };
      toPlace(): Place;
    }

    interface AutocompleteSuggestionResult {
      placePrediction?: PlacePrediction | null;
    }

    class AutocompleteSuggestion {
      static fetchAutocompleteSuggestions(request: {
        input: string;
        sessionToken?: AutocompleteSessionToken;
        includedRegionCodes?: string[];
      }): Promise<{ suggestions: AutocompleteSuggestionResult[] }>;
    }

    class Place {
      constructor(options: { id: string });
      location?: LatLng;
      types?: string[];
      addressComponents?: GeocoderAddressComponent[];
      fetchFields(options: { fields: string[] }): Promise<void>;
    }
  }
}

declare const google: {
  maps: typeof google.maps & {
    Geocoder: typeof google.maps.Geocoder;
    places: typeof google.maps.places;
  };
};
