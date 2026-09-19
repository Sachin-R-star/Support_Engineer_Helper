import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { TaxonomyService } from '../services/taxonomyService';

const router = Router();

const SearchQuerySchema = z.object({
  query: z.string()
});

// POST /api/search
router.post('/', (req: Request, res: Response) => {
  try {
    const body = SearchQuerySchema.parse(req.body);
    const candidates = TaxonomyService.search(body.query);
    return res.status(200).json({ success: true, count: candidates.length, candidates });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message || error });
  }
});

export default router;
