export const isImagePath=value=>typeof value==='string'&&/\.(png|jpe?g|gif|webp)$/i.test(value);
export const isDocumentPath=value=>typeof value==='string'&&(/\.md$/i.test(value)||isImagePath(value));
