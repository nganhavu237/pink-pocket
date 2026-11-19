import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '../generated/prisma/client.js'
import { HttpError } from '../middleware/error-handler.js'

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const formats: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const photoInfo = { version: true, width: true, height: true } as const
export async function preparePhoto(data: Buffer, type: string) {
  if (!PHOTO_TYPES.includes(type))
    throw new HttpError(415, 'PHOTO_TYPE', 'Use a JPEG, PNG or WebP photo')
  if (data.length > MAX_PHOTO_BYTES)
    throw new HttpError(413, 'PHOTO_TOO_LARGE', 'Choose a photo up to 5 MB')
  if (!data.length)
    throw new HttpError(400, 'PHOTO_INVALID', 'Choose a valid photo')
  const signature =
    type === 'image/jpeg'
      ? data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      : type === 'image/png'
        ? data
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : data.subarray(0, 4).toString() === 'RIFF' &&
          data.subarray(8, 12).toString() === 'WEBP'
  if (!signature)
    throw new HttpError(
      400,
      'PHOTO_INVALID',
      'Choose a valid photo matching its file type',
    )
  try {
    const image = sharp(data, { limitInputPixels: 20000000, failOn: 'warning' })
    const metadata = await image.metadata()
    if (metadata.format !== formats[type] || (metadata.pages ?? 1) > 1)
      throw new HttpError(
        400,
        'PHOTO_INVALID',
        'Choose a still JPEG, PNG or WebP photo matching its file type',
      )
    // Re-encoding validates compressed data and strips EXIF/GPS and other metadata.
    const output = await image
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .timeout({ seconds: 5 })
      .toBuffer({ resolveWithObject: true })
    if (output.data.length > MAX_PHOTO_BYTES)
      throw new HttpError(413, 'PHOTO_TOO_LARGE', 'Choose a smaller photo')
    return {
      data: new Uint8Array(output.data),
      width: output.info.width,
      height: output.info.height,
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(
      400,
      'PHOTO_INVALID',
      'Choose a valid photo under 20 megapixels',
    )
  }
}
export function createPhotos(db: PrismaClient) {
  return {
    info: (userId: string) =>
      db.mySpacePhoto.findUnique({ where: { userId }, select: photoInfo }),
    async get(userId: string) {
      const photo = await db.mySpacePhoto.findUnique({ where: { userId } })
      if (!photo)
        throw new HttpError(404, 'PHOTO_NOT_FOUND', 'No photo uploaded')
      return photo
    },
    async save(userId: string, data: Buffer, type: string) {
      const prepared = await preparePhoto(data, type)
      const values = { ...prepared, version: randomUUID() }
      return db.mySpacePhoto.upsert({
        where: { userId },
        create: { userId, ...values },
        update: values,
        select: photoInfo,
      })
    },
    async remove(userId: string) {
      await db.mySpacePhoto.deleteMany({ where: { userId } })
    },
  }
}
