package service

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	imagedraw "image/draw"
	"image/jpeg"
	"image/png"
	"math"
	"strings"

	xdraw "golang.org/x/image/draw"
)

type ImageFitMode string

const (
	ImageFitModeContain ImageFitMode = "contain"
)

func NormalizeImageForTarget(imageValue string, targetWidth, targetHeight int) (string, error) {
	mimeType, base64Data, err := DecodeBase64FileData(imageValue)
	if err != nil {
		return "", err
	}

	img, format, err := decodeImageBytes(base64Data)
	if err != nil {
		return "", err
	}

	bounds := img.Bounds()
	if bounds.Dx() == targetWidth && bounds.Dy() == targetHeight {
		if strings.HasPrefix(imageValue, "data:") {
			return imageValue, nil
		}
		if mimeType == "" {
			mimeType = "image/" + format
		}
		return fmt.Sprintf("data:%s;base64,%s", mimeType, base64Data), nil
	}

	fitted := fitImageContain(img, targetWidth, targetHeight)
	encoded, outMimeType, err := encodeNormalizedImage(fitted, mimeType)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("data:%s;base64,%s", outMimeType, encoded), nil
}

func decodeImageBytes(base64Data string) (image.Image, string, error) {
	raw, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return nil, "", fmt.Errorf("failed to decode base64 image: %w", err)
	}
	img, format, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, "", fmt.Errorf("failed to decode image: %w", err)
	}
	return img, format, nil
}

func fitImageContain(src image.Image, targetWidth, targetHeight int) image.Image {
	canvas := image.NewRGBA(image.Rect(0, 0, targetWidth, targetHeight))

	background := drawBlurBackground(src, targetWidth, targetHeight)
	imagedraw.Draw(canvas, canvas.Bounds(), background, image.Point{}, imagedraw.Src)

	srcBounds := src.Bounds()
	scale := math.Min(float64(targetWidth)/float64(srcBounds.Dx()), float64(targetHeight)/float64(srcBounds.Dy()))
	if scale <= 0 {
		scale = 1
	}
	fitWidth := int(math.Round(float64(srcBounds.Dx()) * scale))
	fitHeight := int(math.Round(float64(srcBounds.Dy()) * scale))
	if fitWidth < 1 {
		fitWidth = 1
	}
	if fitHeight < 1 {
		fitHeight = 1
	}

	resized := image.NewRGBA(image.Rect(0, 0, fitWidth, fitHeight))
	xdraw.CatmullRom.Scale(resized, resized.Bounds(), src, srcBounds, imagedraw.Over, nil)

	offsetX := (targetWidth - fitWidth) / 2
	offsetY := (targetHeight - fitHeight) / 2
	imagedraw.Draw(canvas, image.Rect(offsetX, offsetY, offsetX+fitWidth, offsetY+fitHeight), resized, image.Point{}, imagedraw.Over)

	return canvas
}

func drawBlurBackground(src image.Image, targetWidth, targetHeight int) image.Image {
	srcBounds := src.Bounds()
	scale := math.Max(float64(targetWidth)/float64(srcBounds.Dx()), float64(targetHeight)/float64(srcBounds.Dy()))
	bgWidth := int(math.Ceil(float64(srcBounds.Dx()) * scale))
	bgHeight := int(math.Ceil(float64(srcBounds.Dy()) * scale))
	if bgWidth < 1 {
		bgWidth = targetWidth
	}
	if bgHeight < 1 {
		bgHeight = targetHeight
	}

	resized := image.NewRGBA(image.Rect(0, 0, bgWidth, bgHeight))
	xdraw.ApproxBiLinear.Scale(resized, resized.Bounds(), src, srcBounds, imagedraw.Over, nil)
	blurred := boxBlurRGBA(resized, 10)
	dimmed := dimImageRGBA(blurred, 0.88)

	canvas := image.NewRGBA(image.Rect(0, 0, targetWidth, targetHeight))
	offsetX := (targetWidth - bgWidth) / 2
	offsetY := (targetHeight - bgHeight) / 2
	imagedraw.Draw(canvas, image.Rect(offsetX, offsetY, offsetX+bgWidth, offsetY+bgHeight), dimmed, image.Point{}, imagedraw.Src)
	return canvas
}

func dimImageRGBA(src *image.RGBA, factor float64) *image.RGBA {
	bounds := src.Bounds()
	result := image.NewRGBA(bounds)
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, a := src.At(x, y).RGBA()
			result.SetRGBA(x, y, color.RGBA{
				R: uint8(math.Min(255, float64(r>>8)*factor)),
				G: uint8(math.Min(255, float64(g>>8)*factor)),
				B: uint8(math.Min(255, float64(b>>8)*factor)),
				A: uint8(a >> 8),
			})
		}
	}
	return result
}

func boxBlurRGBA(src *image.RGBA, radius int) *image.RGBA {
	if radius <= 0 {
		return src
	}
	bounds := src.Bounds()
	result := image.NewRGBA(bounds)
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			var rs, gs, bs, as, count uint32
			for ky := maxInt(bounds.Min.Y, y-radius); ky <= minInt(bounds.Max.Y-1, y+radius); ky++ {
				for kx := maxInt(bounds.Min.X, x-radius); kx <= minInt(bounds.Max.X-1, x+radius); kx++ {
					r, g, b, a := src.At(kx, ky).RGBA()
					rs += r >> 8
					gs += g >> 8
					bs += b >> 8
					as += a >> 8
					count++
				}
			}
			result.SetRGBA(x, y, color.RGBA{
				R: uint8(rs / count),
				G: uint8(gs / count),
				B: uint8(bs / count),
				A: uint8(as / count),
			})
		}
	}
	return result
}

func encodeNormalizedImage(img image.Image, mimeType string) (string, string, error) {
	buffer := bytes.NewBuffer(nil)
	outMimeType := mimeType
	switch strings.ToLower(mimeType) {
	case "image/png":
		if err := png.Encode(buffer, img); err != nil {
			return "", "", err
		}
		outMimeType = "image/png"
	default:
		if err := jpeg.Encode(buffer, img, &jpeg.Options{Quality: 92}); err != nil {
			return "", "", err
		}
		outMimeType = "image/jpeg"
	}
	return base64.StdEncoding.EncodeToString(buffer.Bytes()), outMimeType, nil
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
