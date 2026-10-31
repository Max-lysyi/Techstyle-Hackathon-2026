"""CV quality invariants on known mattes, not fabricated client accuracy scores."""
import base64
import unittest
import cv2
import numpy as np
from worker import segment, restore, decode, png


class QualityTests(unittest.TestCase):
    def sample(self, foreground, background):
        # Supersampled disconnected letters and a hole provide known antialiasing.
        mask = np.zeros((480, 800), np.uint8)
        cv2.putText(mask, 'MAX', (65, 320), cv2.FONT_HERSHEY_SIMPLEX, 2.6, 255, 15)
        alpha = cv2.resize(mask, (200, 120), interpolation=cv2.INTER_AREA) / 255
        fg = np.broadcast_to(np.array(foreground, np.float32), (120, 200, 3))
        bg = np.broadcast_to(np.array(background, np.float32), fg.shape)
        image = np.round(fg * alpha[:, :, None] + bg * (1-alpha[:, :, None])).astype(np.uint8)
        return image, alpha, fg, bg

    def check_matte(self, fg, bg, mode):
        image, truth, foreground, background = self.sample(fg, bg)
        result = segment({'image': png(image), 'box': [10, 35, 160, 55], 'mode': mode})
        matte = decode(result['mask']) / 255
        colors = decode(result['foreground'])[:, :, :3]
        iou = np.count_nonzero((matte>.5)&(truth>.5))/np.count_nonzero((matte>.5)|(truth>.5))
        self.assertGreater(iou, .94)
        self.assertTrue(np.any((matte>0)&(matte<1)), 'edges retain alpha coverage')
        # Compare transfer to an opposite substrate; corrected RGB should beat naive source masking.
        target = np.full_like(foreground, 240 if np.mean(bg)<128 else 20)
        expected = foreground*truth[:, :, None]+target*(1-truth[:, :, None])
        corrected = colors*matte[:, :, None]+target*(1-matte[:, :, None])
        naive = image*matte[:, :, None]+target*(1-matte[:, :, None])
        edge = (truth>.05)&(truth<.95)
        self.assertLess(np.mean(np.abs(corrected[edge]-expected[edge])), np.mean(np.abs(naive[edge]-expected[edge])))
        self.assertTrue(np.array_equal(colors[matte==0], image[matte==0]), 'brush additions retain actual source pixels')

    def test_light_letters(self): self.check_matte([240,240,240], [12,18,25], 'light')
    def test_dark_letters(self): self.check_matte([12,18,25], [240,240,240], 'dark')

    def test_multicolor_and_enclosed_badge(self):
        image = np.full((100,160,3), 245, np.uint8)
        cv2.rectangle(image, (25,20), (120,75), (180,20,10), -1)
        cv2.rectangle(image, (40,30), (65,60), (245,245,245), -1)
        cv2.rectangle(image, (80,30), (105,60), (10,180,240), -1)
        request={'image':png(image), 'box':[20,15,105,65]}
        ordinary=decode(segment({**request,'mode':'multicolor'})['mask'])
        badge=decode(segment({**request,'mode':'emblem'})['mask'])
        self.assertEqual(int(ordinary[45,50]), 0, 'ordinary mode keeps letter holes')
        self.assertEqual(int(badge[45,50]), 255, 'badge mode keeps enclosed white artwork')
        self.assertEqual(int(badge[45,90]), 255, 'second color belongs to same layer')

    def test_local_reconstruction_exact_outside_mask(self):
        yy,xx=np.mgrid[:100,:160]
        background=np.stack([40+xx*.7,60+yy*.6,80+xx*.2], axis=2).astype(np.uint8)
        image=background.copy();image[35:60,50:90]=255
        mask=np.zeros((100,160),np.uint8);mask[33:62,48:92]=255
        for mode in ['telea','ns','gradient']:
            with self.subTest(mode=mode):
                result=decode(restore({'image':png(image),'mask':png(mask),'mode':mode})['image'])
                self.assertTrue(np.array_equal(result[mask==0], image[mask==0]))
                self.assertLess(np.mean(np.abs(result[mask>0].astype(float)-background[mask>0])), 18)

    def test_no_foreground_is_an_error(self):
        with self.assertRaisesRegex(ValueError,'не знайдено'):
            segment({'image':png(np.full((50,100,3),128,np.uint8)), 'box':[10,10,70,30], 'mode':'auto'})


if __name__ == '__main__': unittest.main()
