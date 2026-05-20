import { Stack } from "@mui/material";
import PlantCard from "./PlantCard.jsx";

/**
 * Vertical list of plant cards. Banmore is the only active plant in
 * Phase 1 (Q-NAV-01); others render disabled.
 */
function PlantCardList({
  plants,
  activePlantIds,
  hov,
  sel,
  onHover,
  onLeave,
  onSelect,
}) {
  return (
    <Stack spacing={1.5}>
      {plants.map((plant) => {
        const active = activePlantIds.has(plant.id);
        return (
          <PlantCard
            key={plant.id}
            plant={plant}
            active={active}
            hovered={hov === plant.id}
            selected={sel === plant.id}
            onHover={() => onHover(plant.id)}
            onLeave={() => onLeave(plant.id)}
            onSelect={() => onSelect(plant.id)}
          />
        );
      })}
    </Stack>
  );
}

export default PlantCardList;
