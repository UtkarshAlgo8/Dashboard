import { Box, Stack } from "@mui/material";
import { motion } from "framer-motion";
import ModernPlantCard from "./ModernPlantCard.jsx";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.22,
      delayChildren: 0.25,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, x: 45, y: 15 },
  show: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: {
      duration: 0.85,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

/**
 * Vertical list of plant cards with staggered Framer Motion entrance
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
    <Box
      component={motion.div}
      variants={containerVariants}
      initial="hidden"
      animate="show"
      sx={{ width: "100%" }}
    >
      <Stack spacing={2} sx={{ width: "100%" }}>
        {plants.map((plant, index) => {
          const active = activePlantIds.has(plant.id);
          return (
            <motion.div key={plant.id} variants={cardVariants}>
              <ModernPlantCard
                plant={plant}
                active={active}
                hovered={hov === plant.id}
                selected={sel === plant.id}
                onHover={() => onHover(plant.id)}
                onLeave={() => onLeave(plant.id)}
                onSelect={() => onSelect(plant.id)}
                index={index}
              />
            </motion.div>
          );
        })}
      </Stack>
    </Box>
  );
}

export default PlantCardList;
