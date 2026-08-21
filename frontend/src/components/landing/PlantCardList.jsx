import { Stack } from "@mui/material";
import ModernPlantCard from "./ModernPlantCard.jsx";

/**
 * Vertical list of plant cards.
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
    <Stack spacing={2} sx={{ width: "100%" }}>
      {plants.map((plant) => {
        const active = activePlantIds.has(plant.id);
        return (
          <ModernPlantCard
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

