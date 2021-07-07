import PDFDocument from 'pdfkit';
import forge from 'node-forge';
import fs from 'fs';
import signer from './signpdf';
import {pdfkitAddPlaceholder, extractSignature, plainAddPlaceholder} from './helpers';
import SignPdfError from './SignPdfError';
import P12Signer from './signers/p12Signer';

/**
 * Creates a Buffer containing a PDF.
 * Returns a Promise that is resolved with the resulting Buffer of the PDFDocument.
 * @returns {Promise<Buffer>}
 */
const createPdf = params => new Promise((resolve) => {
    const requestParams = {
        placeholder: {},
        text: 'node-signpdf',
        addSignaturePlaceholder: true,
        pages: 1,
        ...params,
    };

    const pdf = new PDFDocument({
        autoFirstPage: false,
        size: 'A4',
        layout: 'portrait',
        bufferPages: true,
    });
    pdf.info.CreationDate = '';

    if (requestParams.pages < 1) {
        requestParams.pages = 1;
    }

    // Add some content to the page(s)
    for (let i = 0; i < requestParams.pages; i++) {
        pdf
            .addPage()
            .fillColor('#333')
            .fontSize(25)
            .moveDown()
            .text(requestParams.text)
            .save();
    }

    // Collect the ouput PDF
    // and, when done, resolve with it stored in a Buffer
    const pdfChunks = [];
    pdf.on('data', (data) => {
        pdfChunks.push(data);
    });
    pdf.on('end', () => {
        resolve(Buffer.concat(pdfChunks));
    });

    if (requestParams.addSignaturePlaceholder) {
        // Externally (to PDFKit) add the signature placeholder.
        const refs = pdfkitAddPlaceholder({
            pdf,
            pdfBuffer: Buffer.from([pdf]),
            reason: 'I am the author',
            ...requestParams.placeholder,
        });
    }

    // Also end the PDFDocument stream.
    // See pdf.on('end'... on how it is then converted to Buffer.
    pdf.end();
});

describe('Test signing', () => {
    it('expects PDF to be Buffer', async () => {
        try {
            await signer.sign('non-buffer', new P12Signer(Buffer.from('')));
            expect('here').not.toBe('here');
        } catch (e) {
            expect(e instanceof SignPdfError).toBe(true);
            expect(e.type).toBe(SignPdfError.TYPE_INPUT);
            expect(e.message).toMatchSnapshot();
        }
    });
    it('expects signer Signer', async () => {
        try {
            await signer.sign(Buffer.from(''), 'non-signer');
            expect('here').not.toBe('here');
        } catch (e) {
            expect(e instanceof SignPdfError).toBe(true);
            expect(e.type).toBe(SignPdfError.TYPE_INPUT);
            expect(e.message).toMatchSnapshot();
        }
    });
    it('expects PDF to contain a ByteRange placeholder', async () => {
        try {
            await signer.sign(Buffer.from('No BR placeholder\n%%EOF'), new P12Signer(Buffer.from('')));
            expect('here').not.toBe('here');
        } catch (e) {
            expect(e instanceof SignPdfError).toBe(true);
            expect(e.type).toBe(SignPdfError.TYPE_PARSE);
            expect(e.message).toMatchSnapshot();
        }
    });
    it('expects a reasonably sized placeholder', async () => {
        try {
            const pdfBuffer = await createPdf({
                placeholder: {
                    signatureLength: 2,
                },
            });

            const p12Buffer = fs.readFileSync(`${__dirname}/../resources/certificate.p12`);

            await signer.sign(pdfBuffer, new P12Signer(p12Buffer));
            expect('here').not.toBe('here');
        } catch (e) {
            expect(e instanceof SignPdfError).toBe(true);
            expect(e.type).toBe(SignPdfError.TYPE_INPUT);
            expect(e.message).toMatchSnapshot();
        }
    });
    it('signs input PDF', async () => {
        let pdfBuffer = await createPdf();
        const p12Buffer = fs.readFileSync(`${__dirname}/../resources/certificate.p12`);

        pdfBuffer = await signer.sign(pdfBuffer, new P12Signer(p12Buffer));
        expect(pdfBuffer instanceof Buffer).toBe(true);

        const {signature, signedData} = extractSignature(pdfBuffer);
        expect(typeof signature === 'string').toBe(true);
        expect(signedData instanceof Buffer).toBe(true);
    });
    it('signs detached', async () => {
        const p12Buffer = fs.readFileSync(`${__dirname}/../resources/certificate.p12`);

        let pdfBuffer = await createPdf({text: 'Some text'});
        await signer.sign(pdfBuffer, new P12Signer(p12Buffer));
        const signature1 = signer.lastSignature;

        pdfBuffer = await createPdf({text: 'some other text '.repeat(30)});
        await signer.sign(pdfBuffer, new P12Signer(p12Buffer));
        const signature2 = signer.lastSignature;

        expect(signature1).not.toBe(signature2);
        expect(signature1).toHaveLength(signature2.length);
    });
    it('signs a ready pdf', async () => {
        const p12Buffer = fs.readFileSync(`${__dirname}/../resources/certificate.p12`);
        let pdfBuffer = fs.readFileSync(`${__dirname}/../resources/w3dummy.pdf`);
        pdfBuffer = plainAddPlaceholder({
            pdfBuffer,
            reason: 'I have reviewed it.',
            signatureLength: 1612,
        });
        pdfBuffer = await signer.sign(pdfBuffer, new P12Signer(p12Buffer));

        const {signature, signedData} = extractSignature(pdfBuffer);
        expect(typeof signature === 'string').toBe(true);
        expect(signedData instanceof Buffer).toBe(true);
    });
    it('signs a ready pdf that does not have Annots', async () => {
        const p12Buffer = fs.readFileSync(`${__dirname}/../resources/certificate.p12`);
        let pdfBuffer = fs.readFileSync(`${__dirname}/../resources/no-annotations.pdf`);
        pdfBuffer = plainAddPlaceholder({
            pdfBuffer,
            reason: 'I have reviewed it.',
            signatureLength: 1612,
        });
        pdfBuffer = await signer.sign(pdfBuffer, new P12Signer(p12Buffer));

        const {signature, signedData} = extractSignature(pdfBuffer);
        expect(typeof signature === 'string').toBe(true);
        expect(signedData instanceof Buffer).toBe(true);
    });
    it('signs a ready pdf that does not have metadata', async () => {
        const p12Buffer = fs.readFileSync(`${__dirname}/../resources/certificate.p12`);
        let pdfBuffer = fs.readFileSync(`${__dirname}/../resources/no-metadata.pdf`);

        pdfBuffer = plainAddPlaceholder({
            pdfBuffer,
            reason: 'I have reviewed it.',
            signatureLength: 1612,
        });
        pdfBuffer = await signer.sign(pdfBuffer, new P12Signer(p12Buffer));

        const {signature, signedData} = extractSignature(pdfBuffer);
        expect(typeof signature === 'string').toBe(true);
        expect(signedData instanceof Buffer).toBe(true);
    });
    it('signs a ready pdf two times', async () => {
        const secondP12Buffer = fs.readFileSync(`${__dirname}/../resources/withpass.p12`);
        let signedPdfBuffer = fs.readFileSync(`${__dirname}/../resources/signed-once.pdf`);
        signedPdfBuffer = plainAddPlaceholder({
            pdfBuffer: signedPdfBuffer,
            reason: 'second',
            location: 'test location',
            signatureLength: 1592,
        });
        signedPdfBuffer = await signer.sign(signedPdfBuffer, new P12Signer(secondP12Buffer, {passphrase: 'node-signpdf'}));
        const {signature, signedData} = extractSignature(signedPdfBuffer, 2);
        expect(typeof signature === 'string').toBe(true);
        expect(signedData instanceof Buffer).toBe(true);
    });
    it('signs big PDF twice producing big AcroForm ID on the first time', async () => {
        let pdfBuffer = await createPdf({
            pages: 100,
        });
        const p12Buffer = fs.readFileSync(`${__dirname}/../resources/certificate.p12`);

        pdfBuffer = await signer.sign(pdfBuffer, new P12Signer(p12Buffer));
        expect(pdfBuffer instanceof Buffer).toBe(true);

        const {signature, signedData} = extractSignature(pdfBuffer);
        expect(typeof signature === 'string').toBe(true);
        expect(signedData instanceof Buffer).toBe(true);

        const secondP12Buffer = fs.readFileSync(`${__dirname}/../resources/withpass.p12`);
        pdfBuffer = plainAddPlaceholder({
            pdfBuffer,
            reason: 'second',
            location: 'test location',
            signatureLength: 1592,
        });
        pdfBuffer = await signer.sign(pdfBuffer, new P12Signer(secondP12Buffer, {passphrase: 'node-signpdf'}));
        expect(pdfBuffer instanceof Buffer).toBe(true);

        const {signature: secondSignature, signedData: secondSignatureData} = extractSignature(pdfBuffer, 2);
        expect(typeof secondSignature === 'string').toBe(true);
        expect(secondSignatureData instanceof Buffer).toBe(true);
    });
    it('signs a ready pdf containing a link', async () => {
        const p12Buffer = fs.readFileSync(`${__dirname}/../resources/certificate.p12`);
        let pdfBuffer = fs.readFileSync(`${__dirname}/../resources/including-a-link.pdf`);
        pdfBuffer = plainAddPlaceholder({
            pdfBuffer,
            reason: 'I have reviewed it.',
            location: 'some city',
            signatureLength: 1612,
        });
        pdfBuffer = await signer.sign(pdfBuffer, new P12Signer(p12Buffer));

        const {signature, signedData} = extractSignature(pdfBuffer);
        expect(typeof signature === 'string').toBe(true);
        expect(signedData instanceof Buffer).toBe(true);
    });
    it('signs with ca, intermediate and multiple certificates bundle', async () => {
        let pdfBuffer = await createPdf();
        const p12Buffer = fs.readFileSync(`${__dirname}/../resources/bundle.p12`);

        pdfBuffer = await signer.sign(pdfBuffer, new P12Signer(p12Buffer));
        expect(pdfBuffer instanceof Buffer).toBe(true);

        const {signature, signedData} = extractSignature(pdfBuffer);
        expect(typeof signature === 'string').toBe(true);
        expect(signedData instanceof Buffer).toBe(true);
    });
    it('signs with passphrased certificate', async () => {
        let pdfBuffer = await createPdf();
        const p12Buffer = fs.readFileSync(`${__dirname}/../resources/withpass.p12`);

        pdfBuffer = await signer.sign(
            pdfBuffer,
            new P12Signer(
                p12Buffer,
                {passphrase: 'node-signpdf'},
            ),
        );
        expect(pdfBuffer instanceof Buffer).toBe(true);

        const {signature, signedData} = extractSignature(pdfBuffer);
        expect(typeof signature === 'string').toBe(true);
        expect(signedData instanceof Buffer).toBe(true);
    });
    it('errors on wrong certificate passphrase', async () => {
        const pdfBuffer = await createPdf();
        const p12Buffer = fs.readFileSync(`${__dirname}/../resources/withpass.p12`);

        try {
            await signer.sign(
                pdfBuffer,
                new P12Signer(
                    p12Buffer,
                    {passphrase: 'Wrong passphrase'},
                ),
            );
            expect('here').not.toBe('here');
        } catch (e) {
            expect(e instanceof Error).toBe(true);
            expect(e.message).toMatchSnapshot();
        }
    });
    it('errors when no matching certificate is found in bags', async () => {
        const pdfBuffer = await createPdf();
        const p12Buffer = fs.readFileSync(`${__dirname}/../resources/bundle.p12`);

        // Monkey-patch pkcs12 to return no matching certificates although bundle.p12 is correct.
        const originalPkcs12FromAsn1 = forge.pkcs12.pkcs12FromAsn1;
        let p12Instance;
        forge.pkcs12.pkcs12FromAsn1 = (...params) => {
            // This instance will be used for all non-mocked code.
            p12Instance = originalPkcs12FromAsn1(...params);

            return {
                ...p12Instance,
                getBags: ({bagType}) => {
                    if (bagType === forge.pki.oids.certBag) {
                        // Only mock this case.
                        // Make sure there will be no matching certificate.
                        return {
                            [forge.pki.oids.certBag]: [],
                        };
                    }
                    return p12Instance.getBags({bagType});
                },
            };
        };

        try {
            await signer.sign(
                pdfBuffer,
                new P12Signer(p12Buffer),
            );
            expect('here').not.toBe('here');
        } catch (e) {
            expect(e instanceof SignPdfError).toBe(true);
            expect(e.type).toBe(SignPdfError.TYPE_INPUT);
            expect(e.message).toMatchSnapshot();
        } finally {
            forge.pkcs12.pkcs12FromAsn1 = originalPkcs12FromAsn1;
        }
    });
    it('error when final key inside trailer dictionary is /Root', async () => {
        let pdfBuffer = fs.readFileSync(`${__dirname}/../resources/w3dummy-different-trailer.pdf`);
        pdfBuffer = plainAddPlaceholder({
            pdfBuffer,
            reason: 'I have reviewed it.',
            signatureLength: 1612,
        });
        const trailer = pdfBuffer.slice(pdfBuffer.lastIndexOf('trailer')).toString();
        // the trailer should contain only one startxref
        expect(trailer.match(/startxref/g).length).toBe(1);
    });
    it('expects siging to fail because of no byteRangePlaceholder available to sign', async () => {
        try {
            const pdfBuffer = fs.readFileSync(`${__dirname}/../resources/signed.pdf`);
            const p12Buffer = fs.readFileSync(`${__dirname}/../resources/certificate.p12`);

            await signer.sign(pdfBuffer, new P12Signer(p12Buffer));
            expect('here').not.toBe('here');
        } catch (e) {
            expect(e instanceof SignPdfError).toBe(true);
            expect(e.type).toBe(SignPdfError.TYPE_PARSE);
        }
    });
});
