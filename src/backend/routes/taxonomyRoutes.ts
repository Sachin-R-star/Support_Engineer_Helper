import { Router, Request, Response } from 'express';
import { TaxonomyService } from '../services/taxonomyService';

const router = Router();

// GET /api/taxonomy
router.get('/', (req: Request, res: Response) => {
  const taxonomy = TaxonomyService.getTaxonomy();
  return res.status(200).json({ success: true, taxonomy });
});

export default router;
