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

  namespace places {
    enum PlacesServiceStatus {
      OK = "OK",
      ZERO_RESULTS = "ZERO_RESULTS",
      INVALID_REQUEST = "INVALID_REQUEST",
      OVER_QUERY_LIMIT = "OVER_QUERY_LIMIT",
      REQUEST_DENIED = "REQUEST_DENIED",
      UNKNOWN_ERROR = "UNKNOWN_ERROR",
    }

    interface PlaceResult {
      formatted_address?: string;
      name?: string;
      place_id?: string;
      types?: string[];
      address_components?: GeocoderAddressComponent[];
      geometry?: { location?: LatLng };
    }

    interface AutocompletePrediction {
      place_id?: string;
      description: string;
    }

    class AutocompleteSessionToken {}

    class AutocompleteService {
      getPlacePredictions(
        request: {
          input: string;
          componentRestrictions?: { country: string };
          sessionToken?: AutocompleteSessionToken;
        },
        callback: (results: AutocompletePrediction[] | null, status: PlacesServiceStatus) => void
      ): void;
    }

    class PlacesService {
      constructor(attrContainer: HTMLDivElement);
      getDetails(
        request: { placeId: string; fields?: string[] },
        callback: (place: PlaceResult | null, status: PlacesServiceStatus) => void
      ): void;
    }
  }
}
