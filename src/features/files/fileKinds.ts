export const isImagePath=(value:string)=>/\.(png|jpe?g|gif|webp)$/i.test(value);
export const isReferencePath=(value:string)=>/\.md$/i.test(value);
export const imageFileUrl=(path:string,workspace:string)=>'/api/image-file?workspace='+encodeURIComponent(workspace)+'&path='+encodeURIComponent(path);
