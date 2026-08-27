import { Box } from "@mui/material";
import { motion } from "framer-motion";
import ModernPlantCard from "./ModernPlantCard.jsx";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.15,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 15 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.65,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

/**
 * Responsive 2-column Grid of plant cards matching the reference UI
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
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
        gap: { xs: 1.5, md: 2 },
        width: "100%",
      }}
    >
      {plants.map((plant) => {
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
            />
          </motion.div>
        );
      })}
    </Box>
  );
}

export default PlantCardList;
