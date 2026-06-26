import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui";
import { getGoogleMapsApiKey, loadGoogleMapsPlaces } from "@/lib/googleMaps";

export interface SelectedPlace {
  address: string;
  lat: number;
  lng: number;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string) => void;
  onPlaceSelect: (place: SelectedPlace) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder,
  disabled,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  const onChangeRef = useRef(onChange);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  onPlaceSelectRef.current = onPlaceSelect;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!getGoogleMapsApiKey()) {
      setLoadError("חסר מפתח Google Maps. הוסיפו VITE_GOOGLE_MAPS_API_KEY לקובץ .env");
      return;
    }
    loadGoogleMapsPlaces()
      .then(() => setReady(true))
      .catch(() => setLoadError("לא ניתן לטעון את Google Maps"));
  }, []);

  useEffect(() => {
    if (!ready || !inputRef.current || disabled) return;

    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: "il" },
      fields: ["formatted_address", "geometry", "name"],
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const loc = place.geometry?.location;
      if (!loc) return;
      const address = place.formatted_address ?? place.name ?? "";
      onChangeRef.current(address);
      onPlaceSelectRef.current({ address, lat: loc.lat(), lng: loc.lng() });
    });

    return () => google.maps.event.removeListener(listener);
  }, [ready, disabled]);

  return (
    <div>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "הקלידו כתובת והבחרו מהרשימה"}
        disabled={disabled || (!ready && !loadError)}
        autoComplete="off"
      />
      {loadError && <p className="mt-1.5 text-[12px] font-semibold text-danger">{loadError}</p>}
    </div>
  );
}
