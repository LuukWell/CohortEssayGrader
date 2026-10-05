import * as pdfjsLib from 'pdfjs-dist';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

/**
 * Extract text content from a PDF file with page markers.
 * Handles base64 data URI, File, Blob, blob URL, and regular URL inputs.
 * @returns Text content with [PAGE X] markers
 */
export const extractTextFromPdf = async (
  pdfData: string | File | Blob
): Promise<string> => {
  try {
    let documentSource: string | ArrayBuffer | { data: string } | { url: string } =
      pdfData as string;

    if (typeof pdfData === 'string' && pdfData.startsWith('data:application/pdf;base64,')) {
      const base64Part = pdfData.substring('data:application/pdf;base64,'.length);
      if (!base64Part) throw new Error('Invalid base64 data URI for PDF.');
      documentSource = { data: atob(base64Part) };
    } else if (typeof pdfData === 'string' && pdfData.startsWith('blob:')) {
      documentSource = pdfData;
    } else if (pdfData instanceof File || pdfData instanceof Blob) {
      documentSource = await pdfData.arrayBuffer();
    } else if (typeof pdfData === 'string') {
      documentSource = { url: pdfData };
    }

    const loadingTask = pdfjsLib.getDocument(documentSource);
    const pdf = await loadingTask.promise;

    let fullTextContent = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      fullTextContent += `[PAGE ${i}]\n`;
      const pageText = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      fullTextContent += pageText + '\n\n';
    }

    return fullTextContent.trim();
  } catch {
    return '';
  }
};

const pdfUtils = {
  extractTextFromPdf,
};

export default pdfUtils;
