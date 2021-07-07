import {DEFAULT_BYTE_RANGE_PLACEHOLDER, DEFAULT_SIGNATURE_LENGTH} from './const';
// eslint-disable-next-line import/no-unresolved
import PDFKitReferenceMock from './pdfkitReferenceMock';
/**
 * Adds the objects that are needed for Adobe.PPKLite to read the signature.
 * Also includes a placeholder for the actual signature.
 * Returns an Object with all the added PDFReferences.
 * @param {PDFDocument} pdf
 * @param {string} reason
 * @returns {object}
 */
const pdfkitAddPlaceholder = ({
    pdf,
    reason,
    contactInfo = 'emailfromp1289@gmail.com',
    name = 'Name from p12',
    location = 'Location from p12',
    signatureLength = DEFAULT_SIGNATURE_LENGTH,
    byteRangePlaceholder = DEFAULT_BYTE_RANGE_PLACEHOLDER,
    sigType = 'adbe.pkcs7.detached',
}) => {
    /* eslint-disable no-underscore-dangle,no-param-reassign */
    // Generate the signature placeholder
    const signature = pdf.ref({
        Type: 'Sig',
        Filter: 'Adobe.PPKLite',
        SubFilter: sigType,
        ByteRange: [
            0,
            byteRangePlaceholder,
            byteRangePlaceholder,
            byteRangePlaceholder,
        ],
        Contents: Buffer.from(String.fromCharCode(0).repeat(signatureLength)),
        Reason: new String(reason), // eslint-disable-line no-new-wrappers
        M: new Date(),
        ContactInfo: new String(contactInfo), // eslint-disable-line no-new-wrappers
        Name: new String(name), // eslint-disable-line no-new-wrappers
        Location: new String(location), // eslint-disable-line no-new-wrappers
    });

    // Check if pdf already contains acroform field
    if (!pdf._acroform) {
        pdf.initForm();
    }

    const form = pdf._root.data.AcroForm;
    const fieldId = form.data.Fields.length + 1;
    const signatureName = `Signature${fieldId}`;

    form.data = {
        Type: 'AcroForm',
        SigFlags: 3,
        Fields: form.data.Fields,
        DR: form.data.DR,
    };

    const widget = pdf.ref({
        Type: 'Annot',
        Subtype: 'Widget',
        FT: 'Sig',
        Rect: [0, 0, 0, 0],
        V: signature,
        T: new String(signatureName), // eslint-disable-line no-new-wrappers
        // F: 4,
        P: pdf.page.dictionary
    });

    pdf.page.annotations.push(widget); // Include the widget in a page
    form.data.Fields.push(widget);

    signature.end();
    widget.end();
    // form.end() is called by pdfkit itself

    return {
        signature,
        form,
        widget,
    };
    /* eslint-enable no-underscore-dangle,no-param-reassign */
};

export default pdfkitAddPlaceholder;
